import Anthropic from '@anthropic-ai/sdk';
import { BuildError } from '../builder/models.controller.js';
import { MODEL } from '../builder/ai.controller.js';
import { stepIdentity } from './blueprint.js';
import { getTemplateOrFail } from './templates.service.js';

/**
 * "Generate with AI" in the studio's Sample data tab (docs/templates T-07):
 * example records for one of the template's models, written by Claude with
 * the server's ANTHROPIC_API_KEY. Nothing is saved — the tab shows them, and
 * the admin keeps what they like.
 *
 * Links are written as the linked record's display value, from the sample
 * data the template already has for that model, which is how the apply engine
 * resolves them (applyTemplate → createRecords).
 */

const MAX = 20;

const TOOL: Anthropic.Tool = {
	name: 'sample_records',
	description: 'Return the example records.',
	input_schema: {
		type: 'object',
		required: ['records'],
		properties: { records: { type: 'array', items: { type: 'object' }, description: 'One object per record, keyed by field key' } },
	},
};

const describeField = (f: any, sample: Record<string, any[]>, displayOf: (model: string) => string) => {
	const base = `- ${f.key} (${f.label || f.key}): ${f.kind}${f.required ? ', required' : ''}`;
	if (f.kind === 'select' || f.kind === 'multiselect')
		return `${base}; one of ${(f.options || []).map((o: any) => JSON.stringify(typeof o === 'string' ? o : o.value)).join(', ')}`;
	if ((f.kind === 'reference' || f.kind === 'references') && f.ref) {
		const names = (sample[f.ref] || []).map(r => r?.[displayOf(f.ref)]).filter(Boolean);
		return `${base}; links to ${f.ref}${names.length ? ` — use exactly one of ${names.map(n => JSON.stringify(n)).join(', ')}${f.kind === 'references' ? ' (an array)' : ''}` : ' — leave it out (no records to link to yet)'}`;
	}
	if (f.helper) return `${base}; ${f.helper}`;
	return base;
};

export const generateSampleData = async (req: any, idOrKey: string, input: { model?: any; count?: any; note?: any }) => {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new BuildError(503, 'Generating with AI isn’t set up: add ANTHROPIC_API_KEY to the backend .env and restart the server.');
	const doc: any = await getTemplateOrFail(idOrKey);
	const steps: any[] = (doc.draft?.models?.steps || []).filter((s: any) => s?.action !== 'update');
	const step = steps.find(s => stepIdentity(s).name === String(input.model || ''));
	if (!step) throw new BuildError(400, `The template has no model “${input.model}”.`);
	const count = Math.min(Math.max(Number(input.count) || 5, 1), MAX);
	const sample: Record<string, any[]> = doc.draft?.sampleData || {};
	const displayOf = (model: string) => {
		const s = steps.find(x => stepIdentity(x).name === model);
		return s?.displayField || (s?.fields || []).find((f: any) => ['text', 'textarea', 'email'].includes(f.kind))?.key || 'name';
	};
	const o = doc.draft?.overview || {};
	const fields: any[] = (step.fields || []).filter((f: any) => !['formula', 'image', 'images', 'file', 'files', 'video', 'password'].includes(f.kind));
	const prompt = [
		`Write ${count} realistic example records for the model “${stepIdentity(step).title}” (${stepIdentity(step).name}) of a project template.`,
		`The template: ${o.name}${o.summary ? ` — ${o.summary}` : ''}${o.audience ? ` For: ${o.audience}` : ''}`,
		step.description ? `The model: ${step.description}` : '',
		'Fields:',
		...fields.map(f => describeField(f, sample, displayOf)),
		'Dates as YYYY-MM-DD, numbers as numbers, booleans as true/false. Varied and believable, nothing offensive, no real people’s personal data.',
		input.note ? `Also: ${String(input.note).slice(0, 500)}` : '',
		'Call sample_records with them.',
	]
		.filter(Boolean)
		.join('\n');

	const client = new Anthropic({ apiKey });
	try {
		const reply = await client.messages
			.stream({ model: MODEL(), max_tokens: 16000, tools: [TOOL], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content: prompt }] })
			.finalMessage();
		const call = reply.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
		const records: any[] = Array.isArray((call?.input as any)?.records) ? (call!.input as any).records : [];
		if (!records.length) throw new BuildError(502, 'Claude didn’t return any records — try again, or add a note on what you want.');
		const keys = new Set(fields.map(f => f.key));
		return {
			records: records
				.filter(r => r && typeof r === 'object' && !Array.isArray(r))
				.slice(0, count)
				.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => keys.has(k)))),
			model: MODEL(),
		};
	} catch (e: any) {
		if (e instanceof BuildError) throw e;
		if (e instanceof Anthropic.AuthenticationError) throw new BuildError(502, 'The Anthropic API key was refused — check ANTHROPIC_API_KEY');
		if (e instanceof Anthropic.RateLimitError) throw new BuildError(429, 'The AI is busy (rate limited) — try again in a minute');
		if (e instanceof Anthropic.APIError) throw new BuildError(502, `The AI request failed: ${e.message}`);
		throw e;
	}
};
