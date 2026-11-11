/**
 * Store search — what a driver does (docs/search SI3). Ranking, settings and filters sit above it, so a driver
 * changes how fast candidates are found, never which results come first.
 */
import type { Filters } from '../facets.js';
import type { Vocab } from '../vocab.js';

/** What one query word may match: any of its words / stems / near spellings, a prefix, a Banglish key, a code. */
export type Cond = { terms: string[]; prefix?: string; phon?: string; code?: string };

export type CandidateSpec = {
	hideOutOfStock: boolean;
	/** Every word's condition: documents matching all of them come first. */
	all: Cond[];
	/** Codes typed whole (a barcode with spaces): documents with one of them are always candidates. */
	codes: string[];
	/** At most this many documents are scored. */
	cap: number;
	/** Fewer whole matches than this: documents matching some of the words are added too… */
	partialBelow: number;
	/** …at most this many (they rank low anyway: coverage²). */
	partialCap: number;
};

export type BrowseSort = 'popular' | 'price' | '-price' | 'newest' | 'name';
export type BrowseSpec = { hideOutOfStock: boolean; filters: Filters; sort: BrowseSort; skip: number; limit: number; facets: boolean };

export interface SearchDriver {
	/** The cache key: the store (project) id. */
	key: string;
	vocabulary(): Promise<Vocab>;
	/** Search documents for scoring: `product`, `fields`, `facets`, `signals`, `card`, `codes`. */
	candidates(spec: CandidateSpec): Promise<any[]>;
	/** No words (a category page): filtered, sorted and paged by the database, with every filter's counts if asked. */
	browse(spec: BrowseSpec): Promise<{ docs: any[]; total: number; facetDocs?: any[] }>;
	/** Active search documents of these products (a search rule's pins, SI-15). */
	byProducts?(products: string[], hideOutOfStock: boolean): Promise<any[]>;
}
