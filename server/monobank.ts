// monobank acquiring (Plata by mono): https://api.monobank.ua/docs/acquiring.html
// MONO_TOKEN is the merchant token from the monobank business cabinet (a test
// token from the same cabinet charges nothing).
//
// Flow: invoice/create → the player pays on monobank's page (pageUrl) → monobank
// POSTs the invoice to our webhook, signed with ECDSA (header X-Sign, base64,
// over the raw body; the public key comes from /api/merchant/pubkey) → we check
// the signature and credit the purchase. The return page also asks
// invoice/status, so a lost webhook does not lose a purchase.

import { createVerify } from 'node:crypto';
import type { Invoice, PaymentProvider, ProviderState, PurchaseStatus } from '../src/economy/payments';

const API = 'https://api.monobank.ua/api/merchant';
const CCY: Record<string, number> = { UAH: 980 };
const CCY_NAME: Record<number, string> = { 980: 'UAH' };

/** monobank's invoice statuses → ours. created/processing/hold: still waiting. */
const STATUS: Record<string, PurchaseStatus> = {
  created: 'pending',
  processing: 'pending',
  hold: 'pending',
  success: 'paid',
  failure: 'failed',
  expired: 'expired',
  reversed: 'refunded',
};

interface MonoInvoice {
  invoiceId: string;
  status: string;
  amount: number;
  finalAmount?: number;
  ccy: number;
  reference?: string;
}

function state(inv: MonoInvoice): ProviderState {
  return { status: STATUS[inv.status] ?? 'pending', amount: inv.finalAmount ?? inv.amount, ccy: CCY_NAME[inv.ccy] ?? String(inv.ccy) };
}

export class MonoPayments implements PaymentProvider {
  id = 'mono';
  private pubkey: string | null = null;

  constructor(private token: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}/${path}`, {
      method,
      headers: { 'X-Token': this.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`monobank ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async createInvoice(inv: Invoice) {
    const r = await this.call<{ invoiceId: string; pageUrl: string }>('POST', 'invoice/create', {
      amount: inv.amount,
      ccy: CCY[inv.ccy] ?? 980,
      merchantPaymInfo: { reference: inv.purchaseId, destination: inv.title },
      redirectUrl: inv.redirectUrl,
      webHookUrl: inv.webhookUrl,
      // An unpaid invoice expires in an hour (then it is closed as expired).
      validity: 3600,
      paymentType: 'debit',
    });
    return { providerId: r.invoiceId, pageUrl: r.pageUrl };
  }

  async status(providerId: string): Promise<ProviderState> {
    return state(await this.call<MonoInvoice>('GET', `invoice/status?invoiceId=${encodeURIComponent(providerId)}`));
  }

  private async key(refresh = false): Promise<string> {
    if (!this.pubkey || refresh) {
      const r = await this.call<{ key: string }>('GET', 'pubkey');
      this.pubkey = Buffer.from(r.key, 'base64').toString('utf8');
    }
    return this.pubkey;
  }

  /**
   * A webhook body, if its signature is monobank's (the key is fetched again
   * once if it does not match: monobank may rotate it). Null otherwise.
   */
  async verifyWebhook(raw: Buffer, sign: string): Promise<{ purchaseId: string; providerId: string; state: ProviderState } | null> {
    if (!sign) return null;
    const ok = (pem: string) => createVerify('SHA256').update(raw).verify(pem, Buffer.from(sign, 'base64'));
    let valid = false;
    try {
      valid = ok(await this.key()) || ok(await this.key(true));
    } catch {
      valid = false;
    }
    if (!valid) return null;
    const inv = JSON.parse(raw.toString('utf8')) as MonoInvoice;
    if (!inv.reference || !inv.invoiceId) return null;
    return { purchaseId: inv.reference, providerId: inv.invoiceId, state: state(inv) };
  }
}
