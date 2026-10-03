import { Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Anthropic from '@anthropic-ai/sdk';
import { ApiKey, Feature } from '../../models/builder/_index.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import { BuildError } from './models.controller.js';
import { MODEL } from './ai.controller.js';
import { TEMPLATE_MAX_STEPS, buildFeature, modelCatalog, planFeature, planProblems } from './features.service.js';
import { FEATURE_SCHEMA, catalogText, planFromAi, platformGuide } from './features.schema.js';
import { starterPlan, starterTemplates } from '../../functions/templateSeed.function.js';
import { ProjectTemplate } from '../../models/templates/_index.js';

/**
 * /admin/api/builder/features — the feature wizard's API — and
 * /admin/api/builder/api-keys, the keys AI clients connect to /mcp with.
 */

const fail = (res: Response, status: number, message: string, problems?: string[]) =>
	res.status(status).json({ message, ...(problems && { problems }) });

const answer = (res: Response, e: any) => {
	if (e instanceof BuildError) return fail(res, e.status, e.message, e.problems);
	console.error('Feature builder:', e?.message);
	return fail(res, 500, e?.message || 'Something went wrong');
};

/** GET /builder/features/catalog — the models a feature can link to or change, and the sidebar categories. */
export const getFeatureCatalog = async (req: any, res: Response) => {
	try {
		const [models, categories] = await Promise.all([
			modelCatalog(req.app),
			SidebarCategory.find({}, { name: 1 }).sort({ priority: 1, name: 1 }).lean(),
		]);
		return res.status(200).json({ models, categories });
	} catch (e) {
		return answer(res, e);
	}
};

/** POST /builder/features/plan { plan } — checks a plan; writes nothing. */
export const checkFeaturePlan = async (req: any, res: Response) => {
	try {
		return res.status(200).json({ plan: await planFeature(req, req.body?.plan) });
	} catch (e) {
		return answer(res, e);
	}
};

/** POST /builder/features/build { plan } */
export const buildFeaturePlan = async (req: any, res: Response) => {
	try {
		const result = await buildFeature(req, req.body?.plan, { source: 'wizard' });
		return res.status(201).json(result);
	} catch (e) {
		return answer(res, e);
	}
};

/**
 * GET /builder/starters — the starter templates a new project can begin with
 * (WO-35): the published app templates (docs/templates TD14), else the code list.
 */
export const listStarters = async (_req: any, res: Response) => {
	try {
		return res.status(200).json({ doc: await starterTemplates() });
	} catch (e) {
		return answer(res, e);
	}
};

/** POST /builder/starters/:key — builds one's models, all or nothing, like any feature. */
export const buildStarter = async (req: any, res: Response) => {
	try {
		const starter = await starterPlan(req.params.key);
		if (!starter) return res.status(404).json({ message: 'No such template' });
		const result = await buildFeature(req, planFromAi(starter.plan), { source: starter.template ? 'template' : 'wizard', maxSteps: TEMPLATE_MAX_STEPS });
		if (starter.template)
			await ProjectTemplate.updateOne({ _id: starter.template }, { $inc: { 'usage.applied': 1 }, $set: { 'usage.lastAppliedAt': new Date() } });
		return res.status(201).json(result);
	} catch (e) {
		return answer(res, e);
	}
};

/** GET /builder/features — what's been built, newest first. */
export const listFeatures = async (req: any, res: Response) => {
	try {
		const doc = await Feature.find({}, { plan: 0 })
			.sort({ createdAt: -1 })
			.limit(100)
			.populate('createdBy', 'name email')
			.populate('apiKey', 'name prefix')
			.lean();
		return res.status(200).json({ doc });
	} catch (e) {
		return answer(res, e);
	}
};

/* ------------------------------------------------------ plan with AI */

const MAX_PROMPT = 6000;
const MAX_ATTEMPTS = 3;

const TOOL: Anthropic.Tool = {
	name: 'propose_feature',
	description: 'Propose a feature: the new models, the changes to existing ones, and how they link.',
	input_schema: FEATURE_SCHEMA as any,
};

/**
 * POST /builder/features/ai { prompt, current? }
 *
 * A plan from a description, by Claude on the server's key — the same
 * propose → check → fix loop as "Build with AI" in the model wizard, over a
 * whole feature. `current` is the plan so far, to refine rather than restart.
 * Nothing is built: the wizard walks the user through the steps.
 */
export const aiPlanFeature = async (req: any, res: Response) => {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return fail(res, 503, 'Planning with AI isn’t set up: add ANTHROPIC_API_KEY to the backend .env and restart the server.');
	const prompt = String(req.body?.prompt || '').trim();
	if (!prompt) return fail(res, 400, 'Describe the feature you want');
	if (prompt.length > MAX_PROMPT) return fail(res, 400, `Keep the description under ${MAX_PROMPT} characters`);

	try {
		const [catalog, categories] = await Promise.all([
			modelCatalog(req.app),
			SidebarCategory.find({}, { name: 1 }).sort({ priority: 1, name: 1 }).lean(),
		]);
		const system = `${platformGuide()}

Models that exist now:
${catalogText(catalog)}

Sidebar categories: ${(categories as any[]).map(c => c.name).join(', ') || '(none)'} — or "new".

Answer by calling propose_feature once with the whole plan — never with plain text, not even to ask a question. When something is unclear, make a sensible assumption and say so in the summary. Write titles, labels, rationales and the summary in the language of the request.`;

		const current = req.body?.current;
		const messages: Anthropic.MessageParam[] = [
			{
				role: 'user',
				content: current?.steps?.length
					? `Here is the plan so far:\n${JSON.stringify(current, null, 2)}\n\nChange it as follows, keeping what isn't mentioned:\n${prompt}`
					: prompt,
			},
		];
		const client = new Anthropic({ apiKey: key });
		let last: string[] = [];

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
			const reply = await client.messages
				.stream({ model: MODEL(), max_tokens: 64000, system, tools: [TOOL], tool_choice: { type: 'auto' }, messages })
				.finalMessage();
			if (reply.stop_reason === 'refusal') return fail(res, 422, 'Claude declined this request — try describing the feature differently');
			if (reply.stop_reason === 'max_tokens') return fail(res, 502, 'The plan came out too large — ask for fewer models, or plan it in two parts');
			const call = reply.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
			if (!call) {
				if (attempt === MAX_ATTEMPTS - 1) return fail(res, 502, 'Claude didn’t return a plan — try rewording the request');
				messages.push(
					{ role: 'assistant', content: reply.content },
					{ role: 'user', content: 'Please call propose_feature now with the whole plan, making sensible assumptions for anything unclear.' }
				);
				continue;
			}
			const plan = await planFeature(req, planFromAi(call.input));
			if (plan.ok) return res.status(200).json({ plan, model: MODEL() });

			last = planProblems(plan);
			messages.push(
				{ role: 'assistant', content: reply.content },
				{
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: call.id,
							is_error: true,
							content: `The server refused this plan:\n${last.map(p => `- ${p}`).join('\n')}\nCall propose_feature again with these fixed.`,
						},
					],
				}
			);
		}
		return fail(res, 422, 'Claude couldn’t produce a valid plan — try describing it differently', last);
	} catch (e: any) {
		console.error('AI feature planner:', e?.message);
		if (e instanceof Anthropic.AuthenticationError) return fail(res, 502, 'The Anthropic API key was refused — check ANTHROPIC_API_KEY');
		if (e instanceof Anthropic.RateLimitError) return fail(res, 429, 'The AI is busy (rate limited) — try again in a minute');
		if (e instanceof Anthropic.NotFoundError) return fail(res, 502, `The AI model “${MODEL()}” wasn’t found — check ANTHROPIC_MODEL`);
		if (e instanceof Anthropic.APIError) return fail(res, 502, `The AI request failed: ${e.message}`);
		return answer(res, e);
	}
};

/* ---------------------------------------------------------- API keys */

export const hashKey = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');
/** read: the models · build: build and change pages · data: read records (MCP query_records), only when asked for. */
const SCOPES = ['read', 'build', 'data'];
const DEFAULT_SCOPES = ['read', 'build'];

/** GET /builder/api-keys — the signed-in admin's keys (all keys for a '*' role). */
export const listApiKeys = async (req: any, res: Response) => {
	try {
		const all = (req.permissions || []).includes('*');
		const doc = await ApiKey.find(all ? {} : { createdBy: req.user._id })
			.sort({ createdAt: -1 })
			.populate('createdBy', 'name email')
			.lean();
		return res.status(200).json({ doc });
	} catch (e) {
		return answer(res, e);
	}
};

/** POST /builder/api-keys { name, scopes?, expiresInDays? } — the secret is in this answer only. */
export const createApiKey = async (req: any, res: Response) => {
	try {
		const name = String(req.body?.name || '').trim().slice(0, 80);
		if (!name) return fail(res, 400, 'Name the key (e.g. “Claude Desktop”)');
		const scopes = (Array.isArray(req.body?.scopes) ? req.body.scopes : DEFAULT_SCOPES).filter((s: any) => SCOPES.includes(s));
		if (!scopes.length) return fail(res, 400, 'Pick at least one scope');
		const days = Number(req.body?.expiresInDays);
		const secret = `emk_${crypto.randomBytes(24).toString('base64url')}`;
		const doc = await ApiKey.create({
			name,
			prefix: secret.slice(0, 10),
			hash: hashKey(secret),
			scopes,
			createdBy: req.user._id,
			...(days > 0 && { expiresAt: new Date(Date.now() + days * 86400000) }),
		});
		const { hash, ...plain } = doc.toObject();
		return res.status(201).json({ doc: plain, secret });
	} catch (e) {
		return answer(res, e);
	}
};

/** DELETE /builder/api-keys/:id — revoked at once; kept for the activity log. */
export const revokeApiKey = async (req: any, res: Response) => {
	try {
		if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid id');
		const all = (req.permissions || []).includes('*');
		const r = await ApiKey.updateOne(
			{ _id: req.params.id, ...(all ? {} : { createdBy: req.user._id }), revokedAt: null },
			{ $set: { revokedAt: new Date() } }
		);
		if (!r.matchedCount) return fail(res, 404, 'Key not found, or already revoked');
		return res.status(200).json({ message: 'Key revoked' });
	} catch (e) {
		return answer(res, e);
	}
};
