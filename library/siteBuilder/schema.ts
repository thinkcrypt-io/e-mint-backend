/**
 * Structured data forms (docs/seo SEO-04): a page's SEO → Structured data
 * holds the form's values for its schema type as `schemaData` (beside
 * `schemaType` and the custom JSON-LD, `schemaJson`). `schemaProps` turns them
 * into the schema.org properties Google's rich results read; the site's
 * renderer (mint-sites JsonLd.tsx, through the render API's `seo.schemaProps`)
 * and `/site/head` (siteHead.function.ts) merge them over the generated
 * WebPage-style block, with the custom JSON-LD on top as before.
 *
 * On a template page the values may be bindings, `{{record.price}}`, filled
 * per record before this runs (render.ts fillSeo).
 *
 * The panel's form (mint-tenant VSeo/schemaForms.ts) names the same keys.
 */

export type SchemaData = Record<string, any>;
export type SchemaContext = { origin: string; title: string; siteName: string; logo: string };

/** The types with a form. Others keep the type and the custom JSON-LD only. */
export const SCHEMA_FORM_TYPES = ['Organization', 'LocalBusiness', 'Product', 'Article', 'BlogPosting', 'FAQPage', 'Event', 'Service'] as const;

export const AVAILABILITY = ['InStock', 'OutOfStock', 'PreOrder', 'BackOrder', 'SoldOut', 'LimitedAvailability', 'OnlineOnly', 'InStoreOnly', 'Discontinued'];
export const EVENT_STATUS = ['EventScheduled', 'EventCancelled', 'EventPostponed', 'EventRescheduled', 'EventMovedOnline'];
export const ATTENDANCE = ['offline', 'online', 'mixed'];
const DAYS: Record<string, string> = { mo: 'Monday', tu: 'Tuesday', we: 'Wednesday', th: 'Thursday', fr: 'Friday', sa: 'Saturday', su: 'Sunday' };

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const t = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** A number from what was typed or bound: "1,200.50 BDT" → 1200.5. */
const num = (v: unknown) => {
	const s = t(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0];
	return s !== undefined ? Number(s) : undefined;
};
const absolute = (url: string, origin: string) => (!url ? '' : /^https?:\/\//i.test(url) ? url : origin && url.startsWith('/') ? origin + url : '');
/** A list from an array, or lines / commas in one string. */
const list = (v: unknown) => (Array.isArray(v) ? v.map(t) : t(v).split(/\n|,/)).map(s => s.trim()).filter(Boolean);
const clean = (o: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && !v.length)));
/** A nested object only when it says something past its @type. */
const some = (o: Record<string, unknown>) => {
	const c = clean(o);
	return Object.keys(c).some(k => k !== '@type') ? c : undefined;
};

const address = (d: SchemaData) =>
	some({ '@type': 'PostalAddress', streetAddress: t(d.street), addressLocality: t(d.city), addressRegion: t(d.region), postalCode: t(d.postalCode), addressCountry: t(d.country) });

const offer = (d: SchemaData, url?: string) => {
	const price = num(d.price);
	if (price === undefined) return undefined;
	const availability = AVAILABILITY.includes(t(d.availability)) ? `https://schema.org/${t(d.availability)}` : undefined;
	return clean({ '@type': 'Offer', price, priceCurrency: t(d.currency).toUpperCase(), availability, url: url || undefined });
};

/** Opening hours: [{ days: ['mo','tu'] or 'Mo-Fr', opens: '09:00', closes: '18:00' }]. */
const hours = (v: unknown) =>
	(Array.isArray(v) ? v : [])
		.filter(isObj)
		.map(h => {
			const raw = Array.isArray(h.days) ? h.days : t(h.days).split(/[\s,]+/);
			const days = [...new Set(raw.map((d: unknown) => DAYS[t(d).slice(0, 2).toLowerCase()]).filter(Boolean))];
			const opens = /^\d{1,2}:\d{2}$/.test(t(h.opens)) ? t(h.opens).padStart(5, '0') : '';
			const closes = /^\d{1,2}:\d{2}$/.test(t(h.closes)) ? t(h.closes).padStart(5, '0') : '';
			return days.length && opens && closes ? { '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens, closes } : null;
		})
		.filter(Boolean);

const business = (d: SchemaData, ctx: SchemaContext, local: boolean) =>
	clean({
		...(local && /^[A-Z][A-Za-z]{2,40}$/.test(t(d.businessType)) && { '@type': t(d.businessType) }),
		name: t(d.name) || ctx.siteName,
		url: ctx.origin || undefined,
		logo: absolute(t(d.logo) || ctx.logo, ctx.origin),
		telephone: t(d.telephone),
		email: t(d.email),
		address: address(d),
		sameAs: list(d.sameAs).filter(u => /^https?:\/\//.test(u)),
		...(local && { priceRange: t(d.priceRange), hasMap: /^https?:\/\//.test(t(d.mapUrl)) ? t(d.mapUrl) : undefined, openingHoursSpecification: hours(d.hours) }),
	});

/** The schema.org properties a type's form makes — merged over the generated block (`@type` too, for a business kind). */
export const schemaProps = (type: string, data: unknown, ctx: SchemaContext): Record<string, unknown> => {
	const d: SchemaData = isObj(data) ? data : {};
	if (!Object.keys(d).length) return {};
	switch (type) {
		case 'Organization':
			return business(d, ctx, false);
		case 'LocalBusiness':
			return business(d, ctx, true);
		case 'Product': {
			const rating = num(d.ratingValue);
			const count = num(d.reviewCount);
			return clean({
				name: t(d.name) || undefined,
				brand: t(d.brand) ? { '@type': 'Brand', name: t(d.brand) } : undefined,
				sku: t(d.sku),
				image: absolute(t(d.image), ctx.origin) || undefined,
				offers: offer(d),
				aggregateRating: rating !== undefined && count ? { '@type': 'AggregateRating', ratingValue: rating, reviewCount: count } : undefined,
			});
		}
		case 'Article':
		case 'BlogPosting':
			return clean({
				headline: (t(d.headline) || ctx.title).slice(0, 110),
				author: t(d.author) ? clean({ '@type': d.authorType === 'Organization' ? 'Organization' : 'Person', name: t(d.author), url: /^https?:\/\//.test(t(d.authorUrl)) ? t(d.authorUrl) : undefined }) : undefined,
				datePublished: t(d.datePublished),
				dateModified: t(d.dateModified),
				image: absolute(t(d.image), ctx.origin) || undefined,
				publisher: ctx.siteName ? clean({ '@type': 'Organization', name: ctx.siteName, logo: absolute(ctx.logo, ctx.origin) || undefined }) : undefined,
			});
		case 'FAQPage':
			return clean({
				mainEntity: (Array.isArray(d.faqs) ? d.faqs : [])
					.filter(isObj)
					.filter(q => t(q.question) && t(q.answer))
					.map(q => ({ '@type': 'Question', name: t(q.question), acceptedAnswer: { '@type': 'Answer', text: t(q.answer) } })),
			});
		case 'Event': {
			const mode = ATTENDANCE.includes(t(d.attendance)) ? t(d.attendance) : 'offline';
			const place = some({ '@type': 'Place', name: t(d.locationName), address: address(d) });
			const online = /^https?:\/\//.test(t(d.onlineUrl)) ? { '@type': 'VirtualLocation', url: t(d.onlineUrl) } : undefined;
			const location = mode === 'online' ? online : mode === 'mixed' ? [place, online].filter(Boolean) : place;
			return clean({
				name: t(d.name) || undefined,
				startDate: t(d.startDate),
				endDate: t(d.endDate),
				eventStatus: EVENT_STATUS.includes(t(d.status)) ? `https://schema.org/${t(d.status)}` : undefined,
				eventAttendanceMode: `https://schema.org/${mode === 'online' ? 'Online' : mode === 'mixed' ? 'Mixed' : 'Offline'}EventAttendanceMode`,
				location: Array.isArray(location) && location.length === 1 ? location[0] : location,
				image: absolute(t(d.image), ctx.origin) || undefined,
				offers: offer(d, /^https?:\/\//.test(t(d.ticketUrl)) ? t(d.ticketUrl) : undefined),
				performer: t(d.performer) ? { '@type': 'PerformingGroup', name: t(d.performer) } : undefined,
				organizer: clean({ '@type': 'Organization', name: t(d.organizer) || ctx.siteName, url: ctx.origin || undefined }),
			});
		}
		case 'Service':
			return clean({
				serviceType: t(d.serviceType),
				areaServed: t(d.areaServed),
				provider: clean({ '@type': d.providerType === 'LocalBusiness' ? 'LocalBusiness' : 'Organization', name: t(d.providerName) || ctx.siteName, url: ctx.origin || undefined }),
				offers: offer(d),
			});
		default:
			return {};
	}
};

/** Every string in the form's values with its {{…}} filled (template pages). */
export const fillDeep = (v: any, fill: (s: string) => string): any =>
	typeof v === 'string' ? fill(v) : Array.isArray(v) ? v.map(x => fillDeep(x, fill)) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, fill)])) : v;

/** The form's values as saved: a plain object of at most 20,000 characters. */
export const schemaDataProblem = (v: unknown) => {
	if (v === undefined) return null;
	if (!isObj(v)) return 'The structured data form’s values are one object';
	return JSON.stringify(v).length > 20000 ? 'The structured data form is at most 20,000 characters' : null;
};
