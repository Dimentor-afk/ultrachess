// Shards for real money: what is on sale, and the contract every payment
// service implements (Paddle on the server, test payments in the demo).
// The game service decides what a purchase is worth and credits it exactly
// once; a provider only takes the money and reports what happened to it.

/** A bundle of shards on sale. Prices are in US cents ($1 = 100). */
export interface ShardProduct {
  id: string;
  shards: number;
  /** Extra shards over the smallest bundle's rate, in percent (for the label). */
  bonus: number;
  price: number;
  ccy: 'USD';
}

export const SHARD_PRODUCTS: ShardProduct[] = [
  { id: 'shards-400', shards: 400, bonus: 0, price: 99, ccy: 'USD' },
  { id: 'shards-2220', shards: 2220, bonus: 10, price: 499, ccy: 'USD' },
  { id: 'shards-4850', shards: 4850, bonus: 20, price: 999, ccy: 'USD' },
  { id: 'shards-10500', shards: 10500, bonus: 30, price: 1999, ccy: 'USD' },
];

export const productById = (id: string) => SHARD_PRODUCTS.find((p) => p.id === id);

/** "$0.99", "$19.99". */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

/** One attempt to buy shards. The journal of these is the record of all real-money transactions. */
export interface PurchaseRow {
  id: string;
  userId: string;
  product: string;
  shards: number;
  /** What the player pays, in cents. */
  amount: number;
  ccy: string;
  provider: string;
  /** The payment service's id (Paddle transaction); null until it exists. */
  providerId: string | null;
  status: PurchaseStatus;
  createdAt: number;
  updatedAt: number;
}

/** What a payment service says about an invoice. */
export interface ProviderState {
  status: PurchaseStatus;
  /**
   * What was actually charged, in cents, checked against the purchase. Null when
   * the service charges exactly the price our server set (Paddle: the price is
   * fixed in the transaction we create, and taxes are its business).
   */
  amount: number | null;
  ccy: string;
}

export interface Invoice {
  purchaseId: string;
  /** The site's address (the test payment page lives in the app). */
  base: string;
  amount: number;
  ccy: string;
  title: string;
  /** Where the payment page sends the player back. */
  redirectUrl: string;
  /** Where the service reports the outcome (server only). */
  webhookUrl: string;
}

export interface PaymentProvider {
  id: string;
  /** Create the invoice: its id at the service and the page where the player pays. */
  createInvoice(inv: Invoice): Promise<{ providerId: string; pageUrl: string }>;
  /** Ask the service how an invoice stands (when the webhook is late or lost). */
  status(providerId: string): Promise<ProviderState>;
  /** Public settings the browser needs to open the service's checkout (Paddle's client token). */
  client?: CheckoutClient;
}

/** How the browser opens the checkout: Paddle's overlay needs its client-side token. */
export interface CheckoutClient {
  provider: 'paddle';
  token: string;
  sandbox: boolean;
}

/** What the shop shows: the bundles, whether they are on sale, and how to pay. */
export interface ShardOffer {
  products: ShardProduct[];
  enabled: boolean;
  test: boolean;
  checkout: CheckoutClient | null;
}

/** What the player sees about a purchase. */
export interface PurchaseView {
  id: string;
  product: string;
  shards: number;
  amount: number;
  ccy: string;
  status: PurchaseStatus;
  createdAt: number;
}

/**
 * Payments without money, for the browser demo and local testing
 * (PAYMENTS=test on a server — never in production: anyone could "pay").
 * The "payment page" is a screen of the app where the player presses Pay
 * or Decline; that screen settles the purchase through the service.
 */
export class TestPayments implements PaymentProvider {
  id = 'test';
  async createInvoice(inv: Invoice) {
    return { providerId: `test-${inv.purchaseId}`, pageUrl: `${inv.base}#/pay/test/${inv.purchaseId}` };
  }
  async status(): Promise<ProviderState> {
    // The test page reports the outcome itself; until then the invoice just waits.
    return { status: 'pending', amount: 0, ccy: 'USD' };
  }
}
