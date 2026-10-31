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

/** The statuses every courier is mapped to (CR6) — the same list as the Delivery model's (blueprint DELIVERY_STATUSES). */
export type NormalStatus =
	| 'draft' | 'booking' | 'booked' | 'pickup-pending' | 'picked-up' | 'in-transit' | 'out-for-delivery' | 'delivered' | 'partly-delivered'
	| 'on-hold' | 'failed-attempt' | 'returning' | 'returned' | 'cancelled' | 'lost' | 'error';

/** What is sent: Mint's words, each adapter turns it into the courier's fields. */
export type Parcel = {
	/** Our invoice: the order code, -2 / -3 on a resend. Never reused, so a retry can't book twice. */
	invoice: string;
	recipient: { name: string; phone: string; address: string; area?: string; city?: string; email?: string };
	/** Cash to collect, whole taka. */
	cod: number;
	/** The goods' value (RedX asks for it). */
	value: number;
	/** kg */
	weight: number;
	items: number;
	note?: string;
	description?: string;
	options: Record<string, any>;
};

export type Booked = {
	consignment: string;
	trackingCode: string;
	trackingUrl?: string;
	courierStatus: string;
	charge?: number;
	/** Pathao's bulk / RedX: the booking was taken but the parcel's id comes later. */
	pending?: boolean;
	/** The manual courier's own name (Sundarban). */
	courierName?: string;
};

/** One thing the courier told us — from a webhook, a status check or a person. */
export type CourierEvent = {
	consignment?: string;
	invoice?: string;
	courierStatus: string;
	/** null: nothing to move (a tracking note, an unknown status). */
	status: NormalStatus | null;
	message?: string;
	at: Date;
	/** Cash the courier says it collected (delivered / partly delivered). */
	collected?: number;
	charge?: number;
	/** The courier paid the merchant out for it (Pathao order.paid, RedX paid). */
	settled?: { ref?: string };
	/** "Rider says delivered" — shown, but no COD payment until confirmed (Steadfast *_approval_pending). */
	awaitingApproval?: boolean;
	/** Changed recipient fields (Steadfast consignment_update). */
	changed?: Record<string, any>;
	/** Same courier, same parcel, same thing → applied once (CR9). */
	key: string;
	kind: 'status' | 'tracking' | 'update' | 'payout' | 'handshake' | 'other';
};

export type WebhookIn = { headers: Record<string, any>; raw: string; body: any; query: Record<string, any> };

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
	quote?(conn: Conn, parcel: Parcel): Promise<{ charge: number }>;
	book?(conn: Conn, parcel: Parcel): Promise<Booked>;
	/** Several at once; each result in the order sent (Steadfast's bulk API). */
	bookMany?(conn: Conn, parcels: Parcel[]): Promise<({ ok: true; booked: Booked } | { ok: false; error: string })[]>;
	/** CR13: after a timeout, the parcel booked under this invoice, if any. */
	find?(conn: Conn, invoice: string): Promise<Booked | null>;
	status?(conn: Conn, delivery: { consignment: string; invoice: string }): Promise<CourierEvent>;
	/** Asks the courier to stop the parcel. `async: true` — the courier confirms later by webhook / status. */
	cancel?(conn: Conn, delivery: { consignment: string; invoice: string }, reason: string): Promise<{ async: boolean; message: string }>;
	webhook?: {
		/** The call is the courier's: its signature / secret matches the connection's. */
		verify(req: WebhookIn, secret: string): boolean;
		parse(req: WebhookIn): CourierEvent[];
		/** The status and headers to answer with (Pathao: 202 + its integration header). */
		reply?(settings: Record<string, any>): { status: number; headers?: Record<string, string> };
	};
	normalise(courierStatus: string): NormalStatus | null;
	/** How a buyer's phone has done with couriers (Steadfast's fraud check, CR-18). Nulls are "not known", never 0. */
	risk?(conn: Conn, phone: string): Promise<Risk>;
	/** The courier's payouts since a date, each with the parcels it settled (Steadfast's payments list, CR11). */
	payouts?(conn: Conn, since: Date): Promise<{ ref: string; parcels: { consignment?: string; invoice?: string }[] }[]>;
}

export type Risk = {
	deliveryRatio: number | null;
	cancellationRatio: number | null;
	delivered: number | null;
	cancelled: number | null;
	reports: number | null;
	volume: string | null;
	categories: string[];
};
