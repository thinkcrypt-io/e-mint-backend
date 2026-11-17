/**
 * Form in pages (docs/multi-page-forms): the add / edit page as steps.
 *
 * Stored on the route config as `formSteps { enabled, review, steps: [{ key, title, description }] }`;
 * `reviewOn` puts the Review summary on that page, above its sections, instead of a page of its own;
 * the form's sections name their page with `step` (none, or a key no step has → the last page).
 * Steps apply only to a form that opens as its own page (the add button's `path`, D2) —
 * a pop-up shows every section.
 */
export type FormStep = { key: string; title: string; description?: string };
export type FormSteps = { review: boolean; reviewOn?: string; steps: FormStep[] };

/** What the panel gets in `/get/config`: the steps when they're on and used, else undefined. */
export const formStepsOf = (config: any): FormSteps | undefined => {
	const fs = config?.formSteps;
	if (!fs?.enabled || config?.route?.button?.path === undefined) return undefined;
	const seen = new Set<string>();
	const steps: FormStep[] = (Array.isArray(fs.steps) ? fs.steps : [])
		.filter((s: any) => s && typeof s.key === 'string' && s.key && String(s.title || '').trim() && !seen.has(s.key) && seen.add(s.key))
		.map((s: any) => ({ key: s.key, title: String(s.title).trim(), ...(s.description && { description: String(s.description) }) }));
	if (!steps.length) return undefined;
	// The summary on a page (Review & finalize) — only a page that's there, and not the first.
	const on = fs.review && typeof fs.reviewOn === 'string' && steps.findIndex(s => s.key === fs.reviewOn) > 0 ? fs.reviewOn : undefined;
	return { review: !!fs.review, ...(on && { reviewOn: on }), steps };
};
