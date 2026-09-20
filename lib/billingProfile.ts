import Content from '../models/content/model.js';

/**
 * Company identity, bank accounts, watermark and footer for invoice/bill/
 * receipt/quotation PDFs and email templates — one place instead of hardcoded
 * literals scattered across renderers. Stored as a Content doc, slug
 * 'billing-profile' (see scripts/seedBillingProfile.js), so it is editable
 * from admin with no redeploy.
 *
 * Modelled on akashbari-backend's lib/brand.ts: read by slug with `.lean()`,
 * wrapped in try/catch, falling back to literal THINKCRYPT defaults so a
 * missing or unreadable document can never break a PDF download.
 */
export type BillingProfile = {
	company: {
		name: string;
		addressLines: string[];
		phone: string;
		email: string;
		website: string;
	};
	/** Repo-relative path, resolved from the backend root. public/ is NOT served
	 *  over http — pdfkit reads these off disk, it cannot fetch a URL. */
	logoPath?: string; // header lockup (brain + wordmark)
	/** Pre-rendered PNG colourways of the mark at `logoPath`, baked by
	 *  scripts/generateBrandAssets.js. pdfkit cannot recolour an image, so a
	 *  design that puts the mark on both a white masthead and a dark band needs
	 *  one file per colour. Missing files fall back to recolouring the SVG at
	 *  request time, so this never has to be configured for a PDF to render. */
	marks?: {
		ink?: string;
		white?: string;
	};
	watermarkPath?: string; // pale mark; the renderer applies its own opacity on top
	brandColor?: string;
	banks: {
		accountName: string;
		accountNo: string;
		bankName: string;
		branch: string;
		isDefault?: boolean;
	}[];
	/** One reference per document, for its whole life: a bill that becomes an
	 *  invoice and then a receipt keeps the same INV-xxxx. Hence `document`
	 *  covers all three docTypes rather than a prefix each — the code is issued
	 *  once at creation and never reissued. */
	codePrefix: {
		document: string;
		quotation: string;
	};
	footerNote: string; // the THANK YOU line
	terms?: string[]; // default quotation terms
};

const BILLING_PROFILE_SLUG = 'billing-profile';
const CACHE_TTL_MS = 60 * 1000;

export const DEFAULT_BILLING_PROFILE: BillingProfile = {
	company: {
		name: 'THINKCRYPT',
		addressLines: ['5B, House 88, Road 17/A,', 'Block E, Banani,', 'Dhaka 1213, Bangladesh'],
		phone: '01828398225',
		email: 'thinkcrypt@gmail.com',
		website: 'https://thinkcrypt.dev',
	},
	// The icon-only badge mark, not the wide wordmark lockup — the PDF renders
	// "THINKCRYPT" as real text next to it, so a text-baked-in logo would double up.
	// Its strokes render near-white, so it's meant to sit on the dark masthead band.
	logoPath: 'public/tc-logo.svg',
	marks: {
		ink: 'public/brand/mark-ink.png',
		white: 'public/brand/mark-white.png',
	},
	watermarkPath: 'public/brand/watermark.png',
	brandColor: '#12A077',
	banks: [
		{
			accountName: 'THINKCRYPT',
			accountNo: '1503097971001',
			bankName: 'The City Bank',
			branch: 'Dhanmondi',
			isDefault: true,
		},
	],
	codePrefix: {
		document: 'INV-',
		quotation: 'QTN-',
	},
	footerNote:
		'***THANK YOU FOR CHOOSING THINKCRYPT. WE LOOK FORWARD TO SERVE YOU AGAIN.\nFor Assistance please call 01828398225 or email at: thinkcrypt@gmail.com',
};

let cache: { value: BillingProfile; expiresAt: number } | null = null;

export const loadBillingProfile = async (): Promise<BillingProfile> => {
	if (cache && cache.expiresAt > Date.now()) return cache.value;

	let profile = DEFAULT_BILLING_PROFILE;

	try {
		const doc: any = await Content.findOne({ slug: BILLING_PROFILE_SLUG }).lean();
		if (doc?.content?.data) {
			profile = { ...DEFAULT_BILLING_PROFILE, ...doc.content.data };
		}
	} catch {
		// Content collection unreachable — fall through to the literal default so a PDF download never breaks.
	}

	cache = { value: profile, expiresAt: Date.now() + CACHE_TTL_MS };
	return profile;
};

export default loadBillingProfile;
