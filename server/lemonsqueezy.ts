// Lemon Squeezy (https://lemonsqueezy.com): a Merchant of Record. It sells the
// shards under its own name, takes the card, charges the buyer's VAT/sales tax
// and pays the author out, so no company of our own is needed to start.
//
// Setup in the Lemon Squeezy dashboard: one product "Shards" with one variant
// (any price: our server sets the real one per checkout), an API key, and a
// webhook to https://<site>/api/payments/lemon/webhook for order_created and
// order_refunded with a signing secret. Env: LEMON_API_KEY, LEMON_STORE_ID,
// LEMON_VARIANT_ID, LEMON_WEBHOOK_SECRET.
//
// Flow: POST /v1/checkouts with our price and our purchase id (custom data) →
// the player pays on Lemon Squeezy's page → it POSTs the order to our webhook,
// signed with HMAC-SHA256 of the raw body (header X-Signature, hex) → we check
// the signature and credit the purchase whose id is in the custom data.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Invoice, PaymentProvider, ProviderState, PurchaseStatus } from '../src/economy/payments';

const API = 'https://api.lemonsqueezy.com/v1';

export interface LemonConfig {
  apiKey: string;
  storeId: string;
  variantId: string;
  webhookSecret: string;
}

/** The config from the environment, or null when Lemon Squeezy is not set up. */
export function lemonConfig(env: NodeJS.ProcessEnv): LemonConfig | null {
  const { LEMON_API_KEY, LEMON_STORE_ID, LEMON_VARIANT_ID, LEMON_WEBHOOK_SECRET } = env;
  if (!LEMON_API_KEY || !LEMON_STORE_ID || !LEMON_VARIANT_ID || !LEMON_WEBHOOK_SECRET) return null;
  return { apiKey: LEMON_API_KEY, storeId: LEMON_STORE_ID, variantId: LEMON_VARIANT_ID, webhookSecret: LEMON_WEBHOOK_SECRET };
}

/** An order event as Lemon Squeezy sends it (only the fields we read). */
interface OrderEvent {
  meta?: { event_name?: string; custom_data?: { purchase_id?: string } };
  data?: { id?: string; attributes?: { status?: string } };
}

/** Order statuses → ours. A partial refund leaves the shards (the player keeps part of what was paid for). */
const STATUS: Record<string, PurchaseStatus> = {
  pending: 'pending',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
};

export class LemonPayments implements PaymentProvider {
  id = 'lemon';

  constructor(private cfg: LemonConfig) {}

  /** A checkout page for this purchase, at our price; it expires in an hour. */
  async createInvoice(inv: Invoice) {
    const res = await fetch(`${API}/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            // Cents in the store's currency (set the store to USD). Tax is added on top by Lemon Squeezy.
            custom_price: inv.amount,
            product_options: { name: inv.title, redirect_url: inv.redirectUrl, enabled_variants: [Number(this.cfg.variantId)] },
            checkout_data: { custom: { purchase_id: inv.purchaseId } },
            expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          },
          relationships: {
            store: { data: { type: 'stores', id: this.cfg.storeId } },
            variant: { data: { type: 'variants', id: this.cfg.variantId } },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Lemon Squeezy ${res.status}: ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as { data: { id: string; attributes: { url: string } } };
    return { providerId: body.data.id, pageUrl: body.data.attributes.url };
  }

  /**
   * A checkout has no status to ask for: the webhook is the source of truth
   * (Lemon Squeezy retries it until we answer 200), so a purchase just waits.
   */
  async status(): Promise<ProviderState> {
    return { status: 'pending', amount: null, ccy: 'USD' };
  }

  /** True when `signature` (hex) is the HMAC-SHA256 of the raw body with our webhook secret. */
  signed(raw: Buffer, signature: string): boolean {
    const want = createHmac('sha256', this.cfg.webhookSecret).update(raw).digest();
    let got: Buffer;
    try {
      got = Buffer.from(signature, 'hex');
    } catch {
      return false;
    }
    return got.length === want.length && timingSafeEqual(got, want);
  }

  /**
   * A webhook body, if it is signed by Lemon Squeezy and is about one of our
   * purchases: the purchase id and what happened to it. Null otherwise.
   */
  verifyWebhook(raw: Buffer, signature: string): { purchaseId: string; state: ProviderState } | null {
    if (!signature || !this.signed(raw, signature)) return null;
    let ev: OrderEvent;
    try {
      ev = JSON.parse(raw.toString('utf8')) as OrderEvent;
    } catch {
      return null;
    }
    const purchaseId = ev.meta?.custom_data?.purchase_id;
    const event = ev.meta?.event_name;
    if (!purchaseId || (event !== 'order_created' && event !== 'order_refunded')) return null;
    const status = STATUS[ev.data?.attributes?.status ?? ''];
    if (!status) return null;
    return { purchaseId, state: { status, amount: null, ccy: 'USD' } };
  }
}
