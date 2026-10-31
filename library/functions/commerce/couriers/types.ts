/**
 * The shape every courier adapter has (docs/couriers README §4, CR5): the
 * engine never knows a courier's field names or statuses, and adapters never
 * touch models — they're handed a connection's opened keys and settings and
 * answer in Mint's words. Booking, status and webhooks join in CR-04 onwards.
 */

/** A key Store settings asks for. Secret ones are sealed and never shown back. */
export type CredentialField = { key: string; label: string; secret: boolean; helper?: string; kind?: 'text' | 'email' };

export type Choice = { value: string; label: string; details?: Record<string, any> };

/** A courier's own setting (pickup store, delivery type…); `from` loads its choices from the courier. */
export type SettingField = {
	key: string;
	label: string;
	kind: 'select' | 'number' | 'text';
	options?: Choice[];
	from?: OptionKind;
	default?: any;
	helper?: string;
};

export type OptionKind = 'stores' | 'cities' | 'zones' | 'areas';

export type Mode = 'test' | 'live';

/** A courier's login token (Pathao), kept sealed on the connection. */
export type Token = { access: string; refresh?: string; expiresAt?: Date };

/** What an adapter is handed: the connection, its keys opened. */
export type Conn = {
	mode: Mode;
	credentials: Record<string, string>;
	settings: Record<string, any>;
	token?: Token | null;
	/** Keeps a new or refreshed token on the connection. */
	saveToken?: (t: Token) => Promise<void>;
};

export type TestResult = {
	ok: boolean;
	/** In plain words: "Connected — balance ৳1,240", or what's wrong and what to do. */
	message: string;
	/** Identifies the courier account (a hash, never a key): the same account in two projects is flagged (CR18). */
	accountKey?: string;
	/** The courier refused the keys themselves (Steadfast locks a key out after ten of these, so never retry). */
	rejected?: boolean;
	details?: Record<string, any>;
};

export interface CourierAdapter {
	id: string;
	name: string;
	countries: string[];
	/** Has a sandbox, so Store settings offers Test / Live. */
	sandbox: boolean;
	/** Can be chosen on Send to courier (booking is built). */
	ready: boolean;
	/** Where the owner opens a merchant account, and where its keys are. */
	links: { signUp: string; keys: string; webhook?: string };
	credentials: CredentialField[];
	settings: SettingField[];
	/** The owner may paste the courier's own webhook secret instead of Mint's (Steadfast's Generate button). */
	ownWebhookSecret?: boolean;
	test(conn: Conn): Promise<TestResult>;
	options?(conn: Conn, what: OptionKind, parent?: string): Promise<Choice[]>;
}
