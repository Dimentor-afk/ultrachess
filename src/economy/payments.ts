// Shards for real money: what is on sale, and the contract every payment
// service (monobank today, an international one later) implements. The
// service decides what a purchase is worth and credits it exactly once; a
// provider only takes the money and reports what happened to it.

/** A bundle of shards on sale. Prices are in kopecks (1 ₴ = 100). */
export interface ShardProduct {
  id: string;
  shards: number;
  /** Extra shards over the smallest bundle's rate, in percent (for the label). */
  bonus: number;
  price: number;
  ccy: 'UAH';
}

export const SHARD_PRODUCTS: ShardProduct[] = [
  { id: 'shards-120', shards: 120, bonus: 0, price: 3900, ccy: 'UAH' },
  { id: 'shards-650', shards: 650, bonus: 6, price: 19900, ccy: 'UAH' },
  { id: 'shards-1400', shards: 1400, bonus: 14, price: 39900, ccy: 'UAH' },
  { id: 'shards-3000', shards: 3000, bonus: 22, price: 79900, ccy: 'UAH' },
];

export const productById = (id: string) => SHARD_PRODUCTS.find((p) => p.id === id);

/** "39 ₴", "199,50 ₴". */
export function formatPrice(kopecks: number): string {
  const uah = kopecks / 100;
  return `${Number.isInteger(uah) ? uah : uah.toFixed(2).replace('.', ',')} ₴`;
}

export type PurchaseStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

/** One attempt to buy shards. The journal of these is the record of all real-money transactions. */
export interface PurchaseRow {
  id: string;
  userId: string;
  product: string;
  shards: number;
  /** What the player pays, in kopecks. */
  amount: number;
  ccy: string;
  provider: string;
  /** The payment service's id (monobank invoiceId); null until the invoice exists. */
  providerId: string | null;
  status: PurchaseStatus;
  createdAt: number;
  updatedAt: number;
}

/** What a payment service says about an invoice. */
export interface ProviderState {
  status: PurchaseStatus;
  /** What was actually charged, in kopecks (checked against the purchase). */
  amount: number;
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
    return { status: 'pending', amount: 0, ccy: 'UAH' };
  }
}
