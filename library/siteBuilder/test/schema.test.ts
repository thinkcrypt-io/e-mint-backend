import { fillDeep, schemaDataProblem, schemaProps } from '../schema';
import { EMPTY_SEO, pageToVseo, vseoToPage, withSiteDefaults } from '../seo';

// docs/seo SEO-04: each type's form becomes the schema.org properties Google's rich results need.
// Required properties per Google Search Central's structured data docs (Product, LocalBusiness, Article, FAQ, Event).
describe('structured data forms (SEO-04)', () => {
	const ctx = { origin: 'https://shop.com', title: 'Leather shoes', siteName: 'Shoe Co', logo: '/logo.png' };

	it('LocalBusiness: name, address, hours, map, socials, a business kind as its @type', () => {
		const p: any = schemaProps(
			'LocalBusiness',
			{
				businessType: 'ShoeStore',
				telephone: '+880 1700 000000',
				street: '12 Road 4',
				city: 'Dhaka',
				postalCode: '1209',
				country: 'BD',
				priceRange: '৳৳',
				mapUrl: 'https://maps.google.com/?q=shoe',
				sameAs: 'https://facebook.com/shoe\nnot a url',
				hours: [{ days: ['mo', 'tu', 'we'], opens: '9:00', closes: '18:00' }, { days: 'Sa Su', opens: '10:00', closes: '16:00' }, { days: [], opens: '1', closes: '2' }],
			},
			ctx
		);
		expect(p['@type']).toBe('ShoeStore');
		expect(p.name).toBe('Shoe Co');
		expect(p.logo).toBe('https://shop.com/logo.png');
		expect(p.address).toEqual({ '@type': 'PostalAddress', streetAddress: '12 Road 4', addressLocality: 'Dhaka', postalCode: '1209', addressCountry: 'BD' });
		expect(p.openingHoursSpecification).toEqual([
			{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday'], opens: '09:00', closes: '18:00' },
			{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '10:00', closes: '16:00' },
		]);
		expect(p.sameAs).toEqual(['https://facebook.com/shoe']);
		expect(p.hasMap).toBe('https://maps.google.com/?q=shoe');
		expect(schemaProps('Organization', { name: 'X', priceRange: '৳', businessType: 'ShoeStore' }, ctx)).toEqual({ name: 'X', url: 'https://shop.com', logo: 'https://shop.com/logo.png' });
	});

	it('Product: brand, offer with price and currency, rating only with a count', () => {
		const p: any = schemaProps('Product', { brand: 'Bata', sku: 'B-1', price: '৳1,250.50', currency: 'bdt', availability: 'InStock', ratingValue: '4.6', reviewCount: '' }, ctx);
		expect(p.brand).toEqual({ '@type': 'Brand', name: 'Bata' });
		expect(p.offers).toEqual({ '@type': 'Offer', price: 1250.5, priceCurrency: 'BDT', availability: 'https://schema.org/InStock' });
		expect(p.aggregateRating).toBeUndefined();
		expect((schemaProps('Product', { ratingValue: 4.6, reviewCount: 12 }, ctx) as any).aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.6, reviewCount: 12 });
		expect((schemaProps('Product', { price: 'ask us' }, ctx) as any).offers).toBeUndefined();
	});

	it('Article / BlogPosting: headline, author, dates, image, the site as publisher', () => {
		const p: any = schemaProps('BlogPosting', { author: 'Asha', authorUrl: 'https://shop.com/asha', datePublished: '2026-10-01', image: '/a.jpg' }, ctx);
		expect(p).toEqual({
			headline: 'Leather shoes',
			author: { '@type': 'Person', name: 'Asha', url: 'https://shop.com/asha' },
			datePublished: '2026-10-01',
			image: 'https://shop.com/a.jpg',
			publisher: { '@type': 'Organization', name: 'Shoe Co', logo: 'https://shop.com/logo.png' },
		});
	});

	it('FAQPage: each question with its answer; half-filled pairs left out', () => {
		const p: any = schemaProps('FAQPage', { faqs: [{ question: 'Do you deliver?', answer: 'Across Bangladesh.' }, { question: 'Only a question' }, 'x'] }, ctx);
		expect(p.mainEntity).toEqual([{ '@type': 'Question', name: 'Do you deliver?', acceptedAnswer: { '@type': 'Answer', text: 'Across Bangladesh.' } }]);
		expect(schemaProps('FAQPage', { faqs: [] }, ctx)).toEqual({});
	});

	it('Event: dates, status, a place, online or both, tickets, organizer', () => {
		const base = { startDate: '2026-12-01T18:00', status: 'EventScheduled', locationName: 'Hall 1', city: 'Dhaka', onlineUrl: 'https://meet.x/1', price: '500', currency: 'BDT', ticketUrl: 'https://tix.x/1' };
		const p: any = schemaProps('Event', base, ctx);
		expect(p.startDate).toBe('2026-12-01T18:00');
		expect(p.eventStatus).toBe('https://schema.org/EventScheduled');
		expect(p.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
		expect(p.location).toEqual({ '@type': 'Place', name: 'Hall 1', address: { '@type': 'PostalAddress', addressLocality: 'Dhaka' } });
		expect(p.offers).toEqual({ '@type': 'Offer', price: 500, priceCurrency: 'BDT', url: 'https://tix.x/1' });
		expect(p.organizer).toEqual({ '@type': 'Organization', name: 'Shoe Co', url: 'https://shop.com' });
		expect((schemaProps('Event', { ...base, attendance: 'online' }, ctx) as any).location).toEqual({ '@type': 'VirtualLocation', url: 'https://meet.x/1' });
		expect((schemaProps('Event', { ...base, attendance: 'mixed' }, ctx) as any).location).toHaveLength(2);
	});

	it('Service: type, area, the provider, an offer', () => {
		expect(schemaProps('Service', { serviceType: 'Shoe repair', areaServed: 'Dhaka', price: '300', currency: 'BDT' }, ctx)).toEqual({
			serviceType: 'Shoe repair',
			areaServed: 'Dhaka',
			provider: { '@type': 'Organization', name: 'Shoe Co', url: 'https://shop.com' },
			offers: { '@type': 'Offer', price: 300, priceCurrency: 'BDT' },
		});
	});

	it('nothing for an empty form or a type without one', () => {
		expect(schemaProps('Product', {}, ctx)).toEqual({});
		expect(schemaProps('JobPosting', { title: 'x' }, ctx)).toEqual({});
		expect(schemaProps('Product', 'nope', ctx)).toEqual({});
	});

	it('fills bindings deep inside the form (template pages)', () => {
		const filled = fillDeep({ price: '{{record.price}}', faqs: [{ question: '{{record.q}}' }], n: 3 }, s => s.replace('{{record.price}}', '900').replace('{{record.q}}', 'Q?'));
		expect(filled).toEqual({ price: '900', faqs: [{ question: 'Q?' }], n: 3 });
	});

	it('travels with the page’s SEO, is checked, and the home page falls back to the site’s', () => {
		const data = { brand: 'Bata', price: '10' };
		expect(pageToVseo(vseoToPage({ schemaType: 'Product', schemaData: data })).schemaData).toEqual(data);
		expect(vseoToPage({}).schemaData).toEqual({});
		expect(schemaDataProblem(undefined)).toBeNull();
		expect(schemaDataProblem([])).toMatch(/one object/);
		expect(schemaDataProblem({ x: 'y'.repeat(20001) })).toMatch(/20,000/);
		const site = { schemaType: 'LocalBusiness', schemaData: { city: 'Dhaka' } };
		expect(withSiteDefaults({ ...EMPTY_SEO }, site, { isHome: true, ownImage: false }).schemaData).toEqual({ city: 'Dhaka' });
		expect(withSiteDefaults({ ...EMPTY_SEO }, site, { isHome: false, ownImage: false }).schemaData).toEqual({});
		expect(withSiteDefaults({ ...EMPTY_SEO, schemaType: 'FAQPage', schemaData: { faqs: [] } }, site, { isHome: true, ownImage: false }).schemaData).toEqual({ faqs: [] });
	});
});
