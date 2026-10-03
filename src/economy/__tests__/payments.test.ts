import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaddlePayments } from '../../../server/paddle';
import { MemoryStore } from '../memoryStore';
import { type Invoice, type PaymentProvider, type ProviderState, SHARD_PRODUCTS, TestPayments } from '../payments';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };
const BASE = 'https://ultrachess.test/';

/** A payment service we control: what the "bank" reports is set by the test. */
class FakeBank implements PaymentProvider {
  id = 'paddle';
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
      webhookUrl: `${BASE}api/payments/paddle/webhook`,
    });
    expect((await svc.purchases(a.token))[0]).toMatchObject({ id: purchaseId, status: 'pending' });

    const paid: ProviderState = { status: 'paid', amount: product.price, ccy: 'USD' };
    await svc.paymentNotice('paddle', purchaseId, 'inv-1', paid);
    await svc.paymentNotice('paddle', purchaseId, 'inv-1', paid); // the bank repeats notices
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
    await svc.paymentNotice('paddle', one.purchaseId, 'inv-1', { status: 'paid', amount: 100, ccy: 'USD' });
    expect((await svc.purchase(a.token, one.purchaseId)).purchase.status).toBe('failed');
    const two = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('paddle', two.purchaseId, 'inv-2', { status: 'expired', amount: 0, ccy: 'USD' });
    // A late "paid" after expiry changes nothing.
    await svc.paymentNotice('paddle', two.purchaseId, 'inv-2', { status: 'paid', amount: product.price, ccy: 'USD' });
    expect((await svc.purchase(a.token, two.purchaseId)).purchase.status).toBe('expired');
    expect(await shards()).toBe(before);
  });

  it('a refund takes the shards back, even below zero', async () => {
    const { svc, store, a, shards } = await setup();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('paddle', purchaseId, 'inv-1', { status: 'paid', amount: product.price, ccy: 'USD' });
    await store.updateUser(a.profile.id, { shards: 10 }); // spent most of them
    await svc.paymentNotice('paddle', purchaseId, 'inv-1', { status: 'refunded', amount: product.price, ccy: 'USD' });
    expect(await shards()).toBe(10 - product.shards);
    expect((await svc.purchases(a.token))[0].status).toBe('refunded');
  });

  it('notices for someone else’s invoice or another provider are ignored', async () => {
    const { svc, a, shards } = await setup();
    const before = await shards();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    const paid: ProviderState = { status: 'paid', amount: product.price, ccy: 'USD' };
    await svc.paymentNotice('paddle', purchaseId, 'inv-999', paid);
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

describe('Paddle', () => {
  afterEach(() => vi.unstubAllGlobals());
  const cfg = { apiKey: 'key', clientToken: 'test_tok', productId: 'pro_1', webhookSecret: 'pdl_ntfset_secret', sandbox: true };
  const NOW = 1_800_000_000_000;
  const sign = (body: string, ts = NOW / 1000, secret = cfg.webhookSecret) =>
    `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`;
  const completed = (purchaseId = 'p1') =>
    JSON.stringify({ event_type: 'transaction.completed', data: { id: 'txn_1', status: 'completed', custom_data: { purchase_id: purchaseId } } });

  it('accepts only fresh notices signed with our secret', () => {
    const paddle = new PaddlePayments(cfg);
    const body = completed();
    expect(paddle.signed(Buffer.from(body), sign(body), NOW)).toBe(true);
    // Changed body, someone else's secret, an old replayed notice, no header: refused.
    expect(paddle.signed(Buffer.from(body.replace('p1', 'p2')), sign(body), NOW)).toBe(false);
    expect(paddle.signed(Buffer.from(body), sign(body, NOW / 1000, 'other'), NOW)).toBe(false);
    expect(paddle.signed(Buffer.from(body), sign(body, NOW / 1000 - 3600), NOW)).toBe(false);
    expect(paddle.signed(Buffer.from(body), '', NOW)).toBe(false);
  });

  it('maps a completed transaction and a full refund to our purchase', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { id: 'txn_1', status: 'completed', custom_data: { purchase_id: 'p1' } } }))));
    const paddle = new PaddlePayments(cfg);
    expect(await paddle.notice(Buffer.from(completed()))).toEqual({ purchaseId: 'p1', transactionId: 'txn_1', state: { status: 'paid', amount: null, ccy: 'USD' } });
    const refund = (type: string) => JSON.stringify({ event_type: 'adjustment.updated', data: { action: 'refund', status: 'approved', type, transaction_id: 'txn_1' } });
    expect((await paddle.notice(Buffer.from(refund('full'))))?.state.status).toBe('refunded');
    // A partial refund, a pending refund, other events: nothing to apply.
    expect(await paddle.notice(Buffer.from(refund('partial')))).toBeNull();
    expect(await paddle.notice(Buffer.from(refund('full').replace('approved', 'pending_approval')))).toBeNull();
    expect(await paddle.notice(Buffer.from(JSON.stringify({ event_type: 'customer.created', data: {} })))).toBeNull();
  });

  it('creates a transaction at our price with our purchase id; the checkout opens in our page', async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ data: { id: 'txn_9', status: 'ready' } })));
    vi.stubGlobal('fetch', fetchStub);
    const paddle = new PaddlePayments(cfg);
    const r = await paddle.createInvoice({ purchaseId: 'p1', base: BASE, amount: 499, ccy: 'USD', title: 'Ultrachess: 650 shards', redirectUrl: 'r', webhookUrl: 'w' });
    expect(r).toEqual({ providerId: 'txn_9', pageUrl: `${BASE}#/pay/paddle/p1/txn_9` });
    const [url, init] = fetchStub.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('https://sandbox-api.paddle.com/transactions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer key');
    const sent = JSON.parse(String(init.body));
    expect(sent.custom_data).toEqual({ purchase_id: 'p1' });
    expect(sent.items[0].price).toMatchObject({ product_id: 'pro_1', unit_price: { amount: '499', currency_code: 'USD' } });
    expect(paddle.client).toEqual({ provider: 'paddle', token: 'test_tok', sandbox: true });
  });

  it('a lost notice: the return page asks Paddle and credits once', async () => {
    const { svc, a, shards } = await setup();
    svc.payments = new PaddlePayments(cfg);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify({ data: { id: 'txn_1', status: init?.method === 'POST' ? 'ready' : 'completed' } }))));
    const before = await shards();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    expect((await svc.purchase(a.token, purchaseId)).purchase.status).toBe('paid');
    await svc.paymentNotice('paddle', purchaseId, 'txn_1', { status: 'paid', amount: null, ccy: 'USD' });
    expect(await shards()).toBe(before + product.shards);
  });
});
