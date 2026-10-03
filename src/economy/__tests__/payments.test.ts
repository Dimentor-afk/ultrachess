import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LemonPayments } from '../../../server/lemonsqueezy';
import { MemoryStore } from '../memoryStore';
import { type Invoice, type PaymentProvider, type ProviderState, SHARD_PRODUCTS, TestPayments } from '../payments';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };
const BASE = 'https://ultrachess.test/';

/** A payment service we control: what the "bank" reports is set by the test. */
class FakeBank implements PaymentProvider {
  id = 'lemon';
  invoices: Invoice[] = [];
  next: ProviderState = { status: 'pending', amount: 0, ccy: 'USD' };
  async createInvoice(inv: Invoice) {
    this.invoices.push(inv);
    return { providerId: `inv-${this.invoices.length}`, pageUrl: `https://pay.example/${this.invoices.length}` };
  }
  async status() {
    return this.next;
  }
}

async function setup() {
  const store = new MemoryStore();
  const svc = new GameService(store, hasher, Date.now, Math.random);
  await svc.init();
  const bank = new FakeBank();
  svc.payments = bank;
  const a = await svc.register('anna@x.com', 'secret-pass-1', 'Анна');
  const shards = async () => (await svc.me(a.token)).shards;
  return { svc, store, bank, a, shards };
}

const product = SHARD_PRODUCTS[1];

describe('buying shards', () => {
  it('a purchase is journaled first, credited once when the bank confirms, and never twice', async () => {
    const { svc, bank, a, shards } = await setup();
    const before = await shards();
    const { purchaseId, pageUrl } = await svc.buyShards(a.token, product.id, BASE);
    expect(pageUrl).toBe('https://pay.example/1');
    expect(bank.invoices[0]).toMatchObject({
      purchaseId,
      amount: product.price,
      ccy: 'USD',
      redirectUrl: `${BASE}#/shop/paid/${purchaseId}`,
      webhookUrl: `${BASE}api/payments/lemon/webhook`,
    });
    expect((await svc.purchases(a.token))[0]).toMatchObject({ id: purchaseId, status: 'pending' });

    const paid: ProviderState = { status: 'paid', amount: product.price, ccy: 'USD' };
    await svc.paymentNotice('lemon', purchaseId, 'inv-1', paid);
    await svc.paymentNotice('lemon', purchaseId, 'inv-1', paid); // the bank repeats notices
    bank.next = paid;
    await svc.purchase(a.token, purchaseId); // and the return page asks again
    expect(await shards()).toBe(before + product.shards);
    expect((await svc.purchase(a.token, purchaseId)).purchase.status).toBe('paid');
  });

  it('a lost notice: the return page asks the bank and credits', async () => {
    const { svc, bank, a, shards } = await setup();
    const before = await shards();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    expect((await svc.purchase(a.token, purchaseId)).purchase.status).toBe('pending');
    bank.next = { status: 'paid', amount: product.price, ccy: 'USD' };
    const r = await svc.purchase(a.token, purchaseId);
    expect(r.purchase.status).toBe('paid');
    expect(r.profile.shards).toBe(before + product.shards);
  });

  it('a different sum is never credited; failures and expiry close the purchase', async () => {
    const { svc, a, shards } = await setup();
    const before = await shards();
    const one = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('lemon', one.purchaseId, 'inv-1', { status: 'paid', amount: 100, ccy: 'USD' });
    expect((await svc.purchase(a.token, one.purchaseId)).purchase.status).toBe('failed');
    const two = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('lemon', two.purchaseId, 'inv-2', { status: 'expired', amount: 0, ccy: 'USD' });
    // A late "paid" after expiry changes nothing.
    await svc.paymentNotice('lemon', two.purchaseId, 'inv-2', { status: 'paid', amount: product.price, ccy: 'USD' });
    expect((await svc.purchase(a.token, two.purchaseId)).purchase.status).toBe('expired');
    expect(await shards()).toBe(before);
  });

  it('a refund takes the shards back, even below zero', async () => {
    const { svc, store, a, shards } = await setup();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('lemon', purchaseId, 'inv-1', { status: 'paid', amount: product.price, ccy: 'USD' });
    await store.updateUser(a.profile.id, { shards: 10 }); // spent most of them
    await svc.paymentNotice('lemon', purchaseId, 'inv-1', { status: 'refunded', amount: product.price, ccy: 'USD' });
    expect(await shards()).toBe(10 - product.shards);
    expect((await svc.purchases(a.token))[0].status).toBe('refunded');
  });

  it('notices for someone else’s invoice or another provider are ignored', async () => {
    const { svc, a, shards } = await setup();
    const before = await shards();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    const paid: ProviderState = { status: 'paid', amount: product.price, ccy: 'USD' };
    await svc.paymentNotice('lemon', purchaseId, 'inv-999', paid);
    await svc.paymentNotice('stripe', purchaseId, 'inv-1', paid);
    expect(await shards()).toBe(before);
  });

  it('off sale without a payment service; at most 5 open invoices an hour', async () => {
    const { svc, a } = await setup();
    for (let i = 0; i < 5; i++) await svc.buyShards(a.token, product.id, BASE);
    await expect(svc.buyShards(a.token, product.id, BASE)).rejects.toThrow(/незавершених/);
    await expect(svc.buyShards(a.token, 'free-shards', BASE)).rejects.toThrow(/немає/);
    svc.payments = null;
    expect(svc.shardOffer().enabled).toBe(false);
    await expect(svc.buyShards(a.token, product.id, BASE)).rejects.toThrow(/недоступні/);
  });

  it('test payments: the in-app page pays or declines; not available with a real bank', async () => {
    const { svc, a, shards } = await setup();
    await expect(svc.completeTestPayment(a.token, 'x', true)).rejects.toThrow(/Тестових/);
    svc.payments = new TestPayments();
    const before = await shards();
    const { purchaseId, pageUrl } = await svc.buyShards(a.token, product.id, BASE);
    expect(pageUrl).toBe(`${BASE}#/pay/test/${purchaseId}`);
    const r = await svc.completeTestPayment(a.token, purchaseId, true);
    expect(r.profile.shards).toBe(before + product.shards);
    const b = await svc.register('bohdan@x.com', 'secret-pass-1', 'Богдан');
    await expect(svc.completeTestPayment(b.token, purchaseId, true)).rejects.toThrow(/не знайдено/);
  });
});

describe('Lemon Squeezy', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cfg = { apiKey: 'key', storeId: '11', variantId: '22', webhookSecret: 'whsec' };
  const sign = (body: string, secret = cfg.webhookSecret) => createHmac('sha256', secret).update(body).digest('hex');
  const order = (event: string, status: string, purchaseId = 'p1') =>
    JSON.stringify({ meta: { event_name: event, custom_data: { purchase_id: purchaseId } }, data: { id: '9', attributes: { status, total: 99 } } });

  it('accepts only notices signed with our secret and maps the order', () => {
    const lemon = new LemonPayments(cfg);
    const body = order('order_created', 'paid');
    expect(lemon.verifyWebhook(Buffer.from(body), sign(body))).toEqual({ purchaseId: 'p1', state: { status: 'paid', amount: null, ccy: 'USD' } });
    expect(lemon.verifyWebhook(Buffer.from(order('order_refunded', 'refunded')), sign(order('order_refunded', 'refunded')))?.state.status).toBe('refunded');
    // Changed body, someone else's secret, no signature: refused.
    expect(lemon.verifyWebhook(Buffer.from(body.replace('p1', 'p2')), sign(body))).toBeNull();
    expect(lemon.verifyWebhook(Buffer.from(body), sign(body, 'other'))).toBeNull();
    expect(lemon.verifyWebhook(Buffer.from(body), '')).toBeNull();
    // Other events, a partial refund, no purchase id: nothing to apply.
    const sub = order('subscription_created', 'active');
    expect(lemon.verifyWebhook(Buffer.from(sub), sign(sub))).toBeNull();
    const partial = order('order_refunded', 'partial_refund');
    expect(lemon.verifyWebhook(Buffer.from(partial), sign(partial))).toBeNull();
  });

  it('creates a checkout at our price with our purchase id in the custom data', async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'chk-1', attributes: { url: 'https://x.lemonsqueezy.com/checkout/chk-1' } } })));
    vi.stubGlobal('fetch', fetchStub);
    const lemon = new LemonPayments(cfg);
    const r = await lemon.createInvoice({ purchaseId: 'p1', base: BASE, amount: 499, ccy: 'USD', title: 'Ultrachess: 650 shards', redirectUrl: 'r', webhookUrl: 'w' });
    expect(r).toEqual({ providerId: 'chk-1', pageUrl: 'https://x.lemonsqueezy.com/checkout/chk-1' });
    const [url, init] = fetchStub.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.lemonsqueezy.com/v1/checkouts');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
    const sent = JSON.parse(String(init.body));
    expect(sent.data.attributes).toMatchObject({ custom_price: 499, checkout_data: { custom: { purchase_id: 'p1' } }, product_options: { redirect_url: 'r' } });
    expect(sent.data.relationships).toEqual({ store: { data: { type: 'stores', id: '11' } }, variant: { data: { type: 'variants', id: '22' } } });
  });

  it('a signed notice credits the purchase it names, once', async () => {
    const { svc, a, shards } = await setup();
    svc.payments = new LemonPayments(cfg);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { id: 'chk-1', attributes: { url: 'u' } } }))));
    const before = await shards();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    const paid = { status: 'paid' as const, amount: null, ccy: 'USD' };
    await svc.paymentNotice('lemon', purchaseId, null, paid);
    await svc.paymentNotice('lemon', purchaseId, null, paid);
    expect(await shards()).toBe(before + product.shards);
  });
});
