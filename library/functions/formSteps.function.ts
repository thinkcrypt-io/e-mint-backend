/**
 * Form in pages (docs/multi-page-forms): the add / edit page as steps.
 *
 * Stored on the route config as `formSteps { enabled, review, steps: [{ key, title, description }] }`;
 * the form's sections name their page with `step` (none, or a key no step has → the last page).
 * Steps apply only to a form that opens as its own page (the add button's `path`, D2) —
 * a pop-up shows every section.
 */
export type FormStep = { key: string; title: string; description?: string };
export type FormSteps = { review: boolean; steps: FormStep[] };

/** What the panel gets in `/get/config`: the steps when they're on and used, else undefined. */
export const formStepsOf = (config: any): FormSteps | undefined => {
	const fs = config?.formSteps;
	if (!fs?.enabled || config?.route?.button?.path === undefined) return undefined;
	const seen = new Set<string>();
	const steps: FormStep[] = (Array.isArray(fs.steps) ? fs.steps : [])
		.filter((s: any) => s && typeof s.key === 'string' && s.key && String(s.title || '').trim() && !seen.has(s.key) && seen.add(s.key))
		.map((s: any) => ({ key: s.key, title: String(s.title).trim(), ...(s.description && { description: String(s.description) }) }));
	return steps.length ? { review: !!fs.review, steps } : undefined;
};
