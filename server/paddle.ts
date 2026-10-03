// Paddle Billing (https://www.paddle.com): a Merchant of Record. It sells the
// shards under its own name, takes the card, charges the buyer's VAT/sales tax
// and pays the author out (bank transfer or Payoneer — both work for Ukraine).
//
// Setup in the Paddle dashboard (sandbox-vendors.paddle.com for testing):
// - a product "Ultrachess Shards" (tax category: standard / digital goods);
//   its id (pro_…) is PADDLE_PRODUCT_ID — the price of each purchase comes from us;
// - Developer tools → Authentication: an API key (PADDLE_API_KEY, secret) and a
//   client-side token (PADDLE_CLIENT_TOKEN, public: the browser opens the checkout with it);
// - Developer tools → Notifications: a destination https://<site>/api/payments/paddle/webhook
//   for transaction.completed and adjustment.created / adjustment.updated; its secret
//   key is PADDLE_WEBHOOK_SECRET;
// - Checkout settings → default payment link: https://<site>/ (and approve the domain);
// - PADDLE_SANDBOX=1 while testing in the sandbox.
//
// Flow: POST /transactions with our price and our purchase id (custom_data) →
// the browser opens Paddle's checkout over our page for that transaction →
// Paddle POSTs transaction.completed to our webhook, signed (Paddle-Signature:
// ts=…;h1=HMAC-SHA256 of "ts:body") → we check it and credit the purchase.
// A refund comes as an approved "refund" adjustment of that transaction.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CheckoutClient, Invoice, PaymentProvider, ProviderState, PurchaseStatus } from '../src/economy/payments';

export interface PaddleConfig {
  apiKey: string;
  clientToken: string;
  productId: string;
  webhookSecret: string;
  sandbox: boolean;
}

/** The config from the environment, or null when Paddle is not set up. */
export function paddleConfig(env: NodeJS.ProcessEnv): PaddleConfig | null {
  const { PADDLE_API_KEY, PADDLE_CLIENT_TOKEN, PADDLE_PRODUCT_ID, PADDLE_WEBHOOK_SECRET, PADDLE_SANDBOX } = env;
  if (!PADDLE_API_KEY || !PADDLE_CLIENT_TOKEN || !PADDLE_PRODUCT_ID || !PADDLE_WEBHOOK_SECRET) return null;
  return {
    apiKey: PADDLE_API_KEY,
    clientToken: PADDLE_CLIENT_TOKEN,
    productId: PADDLE_PRODUCT_ID,
    webhookSecret: PADDLE_WEBHOOK_SECRET,
    sandbox: PADDLE_SANDBOX === '1' || PADDLE_SANDBOX === 'true',
  };
}

/** A transaction as Paddle returns it (only the fields we read). */
interface Transaction {
  id: string;
  status: string;
  custom_data?: { purchase_id?: string } | null;
}

/** Transaction statuses → ours. draft/ready/billed: still waiting for the money. */
const STATUS: Record<string, PurchaseStatus> = {
  draft: 'pending',
  ready: 'pending',
  billed: 'pending',
  paid: 'paid',
  completed: 'paid',
  canceled: 'failed',
  past_due: 'pending',
};

/** What a notice means for one of our purchases. */
export interface PaddleNotice {
  purchaseId: string;
  transactionId: string;
  state: ProviderState;
}

export class PaddlePayments implements PaymentProvider {
  id = 'paddle';

  constructor(private cfg: PaddleConfig) {}

  /** What the browser needs to open the checkout (all public). */
  get client(): CheckoutClient {
    return { provider: 'paddle', token: this.cfg.clientToken, sandbox: this.cfg.sandbox };
  }

  private get api(): string {
    return this.cfg.sandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.api}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Paddle ${res.status}: ${text.slice(0, 300)}`);
    return (JSON.parse(text) as { data: T }).data;
  }

  /**
   * A transaction at our price for this purchase. The player pays it in Paddle's
   * checkout, which our page opens (#/pay/paddle/<purchase>/<transaction>).
   */
  async createInvoice(inv: Invoice) {
    const txn = await this.call<Transaction>('POST', 'transactions', {
      items: [
        {
          quantity: 1,
          // A price made for this purchase only (not in the catalog), on our product.
          price: {
            product_id: this.cfg.productId,
            name: inv.title,
            description: inv.title,
            unit_price: { amount: String(inv.amount), currency_code: inv.ccy },
          },
        },
      ],
      custom_data: { purchase_id: inv.purchaseId },
    });
    return { providerId: txn.id, pageUrl: `${inv.base}#/pay/paddle/${inv.purchaseId}/${txn.id}` };
  }

  /** How the transaction stands (the return page asks when a notice is late or lost). */
  async status(providerId: string): Promise<ProviderState> {
    const txn = await this.call<Transaction>('GET', `transactions/${encodeURIComponent(providerId)}`);
    return { status: STATUS[txn.status] ?? 'pending', amount: null, ccy: 'USD' };
  }

  /** True when the Paddle-Signature header (ts=…;h1=…) signs this raw body with our secret. */
  signed(raw: Buffer, header: string, now = Date.now()): boolean {
    const parts = Object.fromEntries(header.split(';').map((p) => p.split('=') as [string, string]));
    const ts = Number(parts.ts);
    if (!ts || !parts.h1 || !/^[0-9a-f]+$/i.test(parts.h1)) return false;
    // An old signed notice replayed later is refused (Paddle sends fresh ones when retrying).
    if (Math.abs(now / 1000 - ts) > 5 * 60) return false;
    const want = createHmac('sha256', this.cfg.webhookSecret).update(`${parts.ts}:`).update(raw).digest();
    const got = Buffer.from(parts.h1, 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  }

  /**
   * A signed notice about one of our purchases: a completed transaction
   * (paid) or an approved full refund. Null for anything else. A refund names
   * only the transaction, so its purchase id is read back from Paddle.
   */
  async notice(raw: Buffer): Promise<PaddleNotice | null> {
    let ev: { event_type?: string; data?: Record<string, unknown> };
    try {
      ev = JSON.parse(raw.toString('utf8'));
    } catch {
      return null;
    }
    const d = ev.data ?? {};
    if (ev.event_type === 'transaction.completed' || ev.event_type === 'transaction.paid') {
      const txn = d as unknown as Transaction;
      const purchaseId = txn.custom_data?.purchase_id;
      if (!purchaseId || !txn.id) return null;
      return { purchaseId, transactionId: txn.id, state: { status: 'paid', amount: null, ccy: 'USD' } };
    }
    if (ev.event_type === 'adjustment.created' || ev.event_type === 'adjustment.updated') {
      // A partial refund leaves the shards (the player keeps part of what was paid for).
      if (d.action !== 'refund' || d.status !== 'approved' || d.type === 'partial') return null;
      const transactionId = String(d.transaction_id ?? '');
      if (!transactionId) return null;
      const txn = await this.call<Transaction>('GET', `transactions/${encodeURIComponent(transactionId)}`);
      const purchaseId = txn.custom_data?.purchase_id;
      if (!purchaseId) return null;
      return { purchaseId, transactionId, state: { status: 'refunded', amount: null, ccy: 'USD' } };
    }
    return null;
  }
}
