import { PROTECTED_ROUTES } from './validate.js';
import { resolveOther, resources } from './viewDocument.controller.js';
import { LinkedRule, linkedRulesOf, targetRouteOf } from '../../functions/linkedRelationships.function.js';
import { isFormulaType, linkedModelOf, parse, refsOf } from '../../functions/formula.function.js';
import { isRef } from '../../functions/fieldLocks.function.js';
import { collectResourceRoutes } from '../../functions/routeRegistry.function.js';

/**
 * The checks a route's Linked Relationships get when its config is saved or
 * published (docs/linked-relationships): every field a rule names exists, the
 * picker leads to a real page, the fields it changes may be edited there and
 * aren't secret or worked out (formula, rollup), and no chain of rules leads
 * back to this page. The save runs the same checks against the records, so
 * these only catch mistakes early — in the builder, not on someone's form.
 */

const SENSITIVE = /pass(word)?|token|secret|api_?key|apikey|private|otp|salt|hash/i;

const has = (settings: Record<string, any>, Model: any, key: string) => {
	const [head, ...rest] = key.split('.');
	// Through a link: `plan.price` — a field of the record the link picks.
	const Linked = rest.length ? linkedModelOf(Model, head) : null;
	if (Linked) return !!Linked.schema.path(rest.join('.'));
	return !!settings?.[key] || !!Model?.schema?.path(key) || !!Model?.schema?.path(head);
};

export const checkLinkedRelationships = async (app: any, route: string, config: any): Promise<string[]> => {
	const rules: LinkedRule[] = linkedRulesOf(config);
	if (!rules.length) return [];
	const entry = resources(app).get(route);
	if (!entry) return [`'${route}' isn't a page records are saved through, so it can't have Linked Relationships.`];
	const source = await resolveOther(entry);
	const Model = entry.source.Model;
	const problems: string[] = [];

	for (const rule of rules) {
		const name = `“${rule.name || rule.id}”`;
		const say = (m: string) => problems.push(`${name}: ${m}`);
		const via = rule.target.via;
		if (!has(source.settings, Model, via)) {
			say(`this page has no field '${via}' to pick the record to change.`);
			continue;
		}
		const targetRoute = targetRouteOf(rule, source.settings);
		const targetEntry = targetRoute ? resources(app).get(targetRoute) : undefined;
		if (!targetRoute || !targetEntry) {
			say(`'${via}' doesn't pick records of a page (${targetRoute || 'none'}).`);
			continue;
		}
		if (PROTECTED_ROUTES.has(targetRoute)) {
			say(`'${targetRoute}' can't be changed by rules.`);
			continue;
		}
		const target = await resolveOther(targetEntry);
		const TModel = targetEntry.source.Model;
		const allow: string[] = target.built?.EDITS?.allowEdits || [];

		for (const c of rule.when || []) if (!has(source.settings, Model, c.field)) say(`the condition's field '${c.field}' isn't on this page.`);
		for (const f of rule.require || []) if (!has(source.settings, Model, f)) say(`the required field '${f}' isn't on this page.`);
		for (const c of rule.target.when || []) if (!has(target.settings, TModel, c.field)) say(`the condition's field '${c.field}' isn't on ${targetRoute}.`);
		// A condition compared with one of this record's fields: `{ ref: 'this.amount' }`.
		for (const c of [...(rule.when || []), ...(rule.target.when || [])])
			if (isRef(c.value)) {
				const [side, ...rest] = c.value.ref.split('.');
				if (side !== 'this' || !rest.length || !has(source.settings, Model, rest.join('.')))
					say(`the condition on '${c.field}' compares with '${c.value.ref}' — use this.<field> with a field of this page.`);
			}

		for (const a of rule.set || []) {
			const f = a.field;
			const s = target.settings?.[f];
			if (!has(target.settings, TModel, f)) say(`${targetRoute} has no field '${f}'.`);
			else if (SENSITIVE.test(f) || TModel.schema.path(f)?.options?.select === false) say(`'${f}' is a hidden field and can't be set by a rule.`);
			else if (isFormulaType(s?.schema?.type) || s?.rollup) say(`'${f}' on ${targetRoute} is worked out by itself and can't be set.`);
			else if (!allow.includes(f)) say(`'${f}' can't be edited on ${targetRoute} — turn on editing for it there first.`);
			if (a.from && !has(source.settings, Model, a.from)) say(`it copies '${a.from}', which isn't on this page.`);
			const step = a.dec !== undefined ? a.dec : a.inc;
			if (step !== undefined) {
				const take = a.dec !== undefined;
				if (TModel.schema.path(f)?.instance !== 'Number') say(`'${f}' must be a number to ${take ? 'take from' : 'add to'} it.`);
				if (typeof step === 'string' && !Number.isFinite(Number(step)) && !has(source.settings, Model, step))
					say(`it ${take ? 'takes off' : 'adds'} '${step}', which isn't on this page.`);
			} else if (a.min !== undefined) say(`'${f}' has a lowest value, which only works when the rule adds to it or takes from it.`);
			if (a.formula)
				try {
					for (const ref of refsOf(parse(a.formula))) {
						const [side, ...rest] = ref.split('.');
						const key = rest.join('.');
						if (side === 'this' ? !has(source.settings, Model, key) : side === 'target' ? !has(target.settings, TModel, key) : true)
							say(`the formula for '${f}' reads '${ref}' — use this.<field>, this.<link>.<field> or target.<field> with fields that exist.`);
					}
				} catch (e: any) {
					say(`the formula for '${f}' doesn't read right: ${e.message}`);
				}
		}
	}

	// A chain of rules that comes back here would change this page's records from their own save.
	const seen = new Set<string>();
	const leadsBack = async (from: string, depth: number): Promise<boolean> => {
		if (depth > 6 || seen.has(from)) return false;
		seen.add(from);
		const e = resources(app).get(from);
		if (!e) return false;
		const r = from === route ? source : await resolveOther(e);
		for (const rule of linkedRulesOf(from === route ? config : r.frontendConfig)) {
			if (rule.block) continue;
			const next = targetRouteOf(rule, r.settings);
			if (!next) continue;
			if (next === route && depth > 0) return true;
			if (next === route && from === route) return true;
			if (await leadsBack(next, depth + 1)) return true;
		}
		return false;
	};
	if (await leadsBack(route, 0)) problems.push(`The rules lead back to ${route} — a record would change itself through another page. Remove one step of the loop.`);

	return problems;
};

/**
 * GET /builder/linked/incoming?route= — the rules on other pages that change
 * this page's records ("Payments can change: Status, Payment date"), so the
 * people shaping a page know what else writes to it. Published copies only.
 */
export const getIncomingLinked = async (req: any, res: any) => {
	try {
		const route = String(req.query.route || '').trim();
		if (!route) return res.status(400).json({ message: 'route is required' });
		const doc: any[] = [];
		for (const e of collectResourceRoutes(req.app)) {
			if (e.route === route) continue;
			const r = await resolveOther(resources(req.app).get(e.route) || e);
			for (const rule of linkedRulesOf(r.frontendConfig)) {
				if (targetRouteOf(rule, r.settings) !== route) continue;
				doc.push({
					route: e.route,
					title: r.frontendConfig?.route?.title || e.route,
					rule: rule.name || rule.id,
					via: rule.target.via,
					block: !!rule.block,
					fields: (rule.set || []).map(a => a.field),
				});
			}
		}
		return res.status(200).json({ doc });
	} catch (e: any) {
		return res.status(500).json({ message: e?.message || 'Could not list the rules' });
	}
};
