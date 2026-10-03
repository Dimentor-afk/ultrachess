import { generateKeyPairSync, createSign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonoPayments } from '../../../server/monobank';
import { MemoryStore } from '../memoryStore';
import { type Invoice, type PaymentProvider, type ProviderState, SHARD_PRODUCTS, TestPayments } from '../payments';
import { GameService } from '../service';
import type { Hasher } from '../store';

const hasher: Hasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };
const BASE = 'https://ultrachess.test/';

/** A payment service we control: what the "bank" reports is set by the test. */
class FakeBank implements PaymentProvider {
  id = 'mono';
  invoices: Invoice[] = [];
  next: ProviderState = { status: 'pending', amount: 0, ccy: 'UAH' };
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
      ccy: 'UAH',
      redirectUrl: `${BASE}#/shop/paid/${purchaseId}`,
      webhookUrl: `${BASE}api/payments/mono/webhook`,
    });
    expect((await svc.purchases(a.token))[0]).toMatchObject({ id: purchaseId, status: 'pending' });

    const paid: ProviderState = { status: 'paid', amount: product.price, ccy: 'UAH' };
    await svc.paymentNotice('mono', purchaseId, 'inv-1', paid);
    await svc.paymentNotice('mono', purchaseId, 'inv-1', paid); // the bank repeats notices
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
    bank.next = { status: 'paid', amount: product.price, ccy: 'UAH' };
    const r = await svc.purchase(a.token, purchaseId);
    expect(r.purchase.status).toBe('paid');
    expect(r.profile.shards).toBe(before + product.shards);
  });

  it('a different sum is never credited; failures and expiry close the purchase', async () => {
    const { svc, a, shards } = await setup();
    const before = await shards();
    const one = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('mono', one.purchaseId, 'inv-1', { status: 'paid', amount: 100, ccy: 'UAH' });
    expect((await svc.purchase(a.token, one.purchaseId)).purchase.status).toBe('failed');
    const two = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('mono', two.purchaseId, 'inv-2', { status: 'expired', amount: 0, ccy: 'UAH' });
    // A late "paid" after expiry changes nothing.
    await svc.paymentNotice('mono', two.purchaseId, 'inv-2', { status: 'paid', amount: product.price, ccy: 'UAH' });
    expect((await svc.purchase(a.token, two.purchaseId)).purchase.status).toBe('expired');
    expect(await shards()).toBe(before);
  });

  it('a refund takes the shards back, even below zero', async () => {
    const { svc, store, a, shards } = await setup();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    await svc.paymentNotice('mono', purchaseId, 'inv-1', { status: 'paid', amount: product.price, ccy: 'UAH' });
    await store.updateUser(a.profile.id, { shards: 10 }); // spent most of them
    await svc.paymentNotice('mono', purchaseId, 'inv-1', { status: 'refunded', amount: product.price, ccy: 'UAH' });
    expect(await shards()).toBe(10 - product.shards);
    expect((await svc.purchases(a.token))[0].status).toBe('refunded');
  });

  it('notices for someone else’s invoice or another provider are ignored', async () => {
    const { svc, a, shards } = await setup();
    const before = await shards();
    const { purchaseId } = await svc.buyShards(a.token, product.id, BASE);
    const paid: ProviderState = { status: 'paid', amount: product.price, ccy: 'UAH' };
    await svc.paymentNotice('mono', purchaseId, 'inv-999', paid);
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

describe('monobank', () => {
  afterEach(() => vi.unstubAllGlobals());

  // monobank signs the raw body with ECDSA (P-256, SHA-256); we play the bank here.
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const sign = (body: string) => createSign('SHA256').update(body).sign(privateKey).toString('base64');
  const fetchStub = vi.fn(async (url: string) => {
    if (url.endsWith('/pubkey')) return new Response(JSON.stringify({ key: Buffer.from(pem).toString('base64') }));
    if (url.includes('invoice/status')) return new Response(JSON.stringify({ invoiceId: 'i1', status: 'success', amount: 19900, ccy: 980 }));
    return new Response(JSON.stringify({ invoiceId: 'i1', pageUrl: 'https://pay.mbnk.biz/i1' }));
  });

  it('checks the signature of a notice and maps the invoice', async () => {
    vi.stubGlobal('fetch', fetchStub);
    const mono = new MonoPayments('token');
    const body = JSON.stringify({ invoiceId: 'i1', status: 'success', amount: 19900, ccy: 980, reference: 'p1' });
    expect(await mono.verifyWebhook(Buffer.from(body), sign(body))).toEqual({
      purchaseId: 'p1',
      providerId: 'i1',
      state: { status: 'paid', amount: 19900, ccy: 'UAH' },
    });
    // Changed body, someone else's key, no signature: refused.
    const forged = body.replace('19900', '1');
    expect(await mono.verifyWebhook(Buffer.from(forged), sign(body))).toBeNull();
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    expect(await mono.verifyWebhook(Buffer.from(body), createSign('SHA256').update(body).sign(other).toString('base64'))).toBeNull();
    expect(await mono.verifyWebhook(Buffer.from(body), '')).toBeNull();
  });

  it('creates invoices in kopecks and UAH, with our purchase as the reference', async () => {
    vi.stubGlobal('fetch', fetchStub);
    const mono = new MonoPayments('token');
    const r = await mono.createInvoice({ purchaseId: 'p1', base: BASE, amount: 19900, ccy: 'UAH', title: 'x', redirectUrl: 'r', webhookUrl: 'w' });
    expect(r).toEqual({ providerId: 'i1', pageUrl: 'https://pay.mbnk.biz/i1' });
    const [url, init] = fetchStub.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.monobank.ua/api/merchant/invoice/create');
    expect((init.headers as Record<string, string>)['X-Token']).toBe('token');
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 19900, ccy: 980, merchantPaymInfo: { reference: 'p1' }, webHookUrl: 'w', redirectUrl: 'r' });
    expect(await mono.status('i1')).toEqual({ status: 'paid', amount: 19900, ccy: 'UAH' });
  });
});
