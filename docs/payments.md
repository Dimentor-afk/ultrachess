# Платежі: уламки за гроші (Paddle)

Уламки продає **Paddle** — «Merchant of Record»: продаж іде від його імені, він приймає картки, PayPal,
Apple/Google Pay, сам нараховує й сплачує податки країни покупця (ПДВ, sales tax), видає чек і переказує
вам гроші за мінусом комісії (~5 % + $0.50). Для старту не потрібен ФОП: гроші накопичуються на балансі
Paddle, а виплату ви отримуєте банківським переказом або на **Payoneer** (обидва працюють для України).
Отриманий дохід треба задекларувати (деталі — з бухгалтером).

Чому не Lemon Squeezy: він виплачує лише через Stripe і PayPal, а для України обидва закриті.

## Як це влаштовано

```
Магазин → «Купити 650 💎» → POST /api/shop/shards
  сервер: запис у журнал покупок (pending) → POST /transactions у Paddle
          (наша ціна на наш товар, id покупки в custom_data) → id транзакції
браузер: #/pay/paddle/<покупка>/<транзакція> → Paddle.js відкриває вікно оплати поверх сайту
Paddle → POST /api/payments/paddle/webhook (Paddle-Signature: ts=…;h1=HMAC-SHA256 "ts:тіло")
  сервер: перевіряє підпис → transaction.completed → в одній транзакції
          покупка pending→paid і +650 уламків гравцю
гравець переходить на #/shop/paid/<id> → сторінка питає статус (і саму транзакцію в Paddle,
  якщо повідомлення ще не дійшло) → «+650 💎»
```

- **Журнал покупок** (`purchases` у SQLite) — запис про кожну спробу: сума в центах, валюта, статус
  (`pending`, `paid`, `failed`, `expired`, `refunded`), id транзакції в Paddle. Запис з'являється до того,
  як гравця відправлено платити, тож жодна оплата не лишиться без сліду.
- **Рівно один раз.** Paddle повторює повідомлення, поки не отримає 200, а гравець може оновити сторінку.
  Зарахування — атомарний перехід `pending → paid` разом із додаванням уламків (`settlePurchase`): хто
  встиг першим, той зарахував, решта нічого не змінює.
- **Ціна.** Її задає наш сервер у транзакції, покупець змінити її не може; податки — справа Paddle.
  Тому сума в повідомленні не порівнюється (`amount: null`).
- **Повернення** — схвалений повний `refund` (подія `adjustment.created/updated`) забирає уламки назад,
  навіть якщо баланс стане від'ємним. Часткове повернення уламків не забирає.
- **Підпис.** Повідомлення без правильного підпису або старші за 5 хвилин ігноруються з кодом 400.
- **Шанси паків** показано в магазині під кожним паком: уламки купують паки з випадковими картками.
- Код: `src/economy/payments.ts` (набори, типи, `PaymentProvider`), `GameService.buyShards / applyPayment`,
  `server/paddle.ts`, сторінка оплати `PaddlePayPage` у `src/ui/Payments.tsx`,
  тести — `src/economy/__tests__/payments.test.ts`.

## Ціни

`SHARD_PRODUCTS` у `src/economy/payments.ts` (у центах): 120 💎 — $0.99, 650 — $4.99, 1400 — $9.99,
3000 — $19.99. Для порівняння: легендарний пак коштує 1000 💎, міфічний — 2500 💎.

## Перевірити локально (без грошей)

```bash
PAYMENTS=test npm start
```

У магазині з'явиться розділ «💎 Уламки» з позначкою «тестова оплата». Замість вікна Paddle
відкривається екран із кнопками «Оплатити» / «Відхилити». У демо без сервера так само.
**Ніколи не вмикайте `PAYMENTS=test` на справжньому сервері:** там будь-хто «заплатить» кнопкою.

## Підключити Paddle

Спершу все в **sandbox** (sandbox-vendors.paddle.com) — він відкривається одразу, без перевірки, і гроші
там не справжні. Потім те саме в бойовому акаунті (vendors.paddle.com), коли Paddle його схвалить.

1. **Товар:** Catalog → Products → New product «Ultrachess Shards», tax category **Standard digital goods**
   (або «Standard»). Ціну додавати не треба — сервер ставить її сам. Скопіюйте **id товару** (`pro_…`).
2. **Ключі:** Developer tools → Authentication:
   - **API key** (секретний, `pdl_sdbx_apikey_…` у sandbox) з правами на transactions (read/write);
   - **Client-side token** (публічний, `test_…` у sandbox) — ним браузер відкриває вікно оплати.
3. **Вебхук:** Developer tools → Notifications → New destination: URL
   `https://ultrachess.fly.dev/api/payments/paddle/webhook`, події `transaction.completed`,
   `adjustment.created`, `adjustment.updated`. Скопіюйте **secret key** цього destination.
4. **Сайт:** Checkout → Checkout settings → **Default payment link** = `https://ultrachess.fly.dev/`;
   у бойовому акаунті додайте домен на перевірку (Website approval).
5. **Секрети на Fly:**
   ```bash
   fly secrets set PADDLE_API_KEY=… PADDLE_CLIENT_TOKEN=… PADDLE_PRODUCT_ID=pro_… PADDLE_WEBHOOK_SECRET=… PADDLE_SANDBOX=1 PUBLIC_URL=https://ultrachess.fly.dev
   ```
6. **Тест:** купіть набір на сайті, у вікні Paddle — тестова картка `4242 4242 4242 4242`, будь-яка майбутня
   дата, CVC `100`. Уламки мають прийти за кілька секунд, в адмін-панелі покупка «оплачено».
7. **Бойовий режим:** після схвалення акаунта — ті самі кроки 1–4 у vendors.paddle.com, нові ключі в
   `fly secrets set …`, а `PADDLE_SANDBOX` приберіть: `fly secrets unset PADDLE_SANDBOX`.
8. **Виплати:** Business account → Payouts → банківський рахунок або Payoneer.

Перед подачею на схвалення впишіть пошту для звернень і дату в `src/ui/LegalPage.tsx` (`CONTACT`):
Paddle перевіряє, що на сайті є ціни, умови продажу, політика конфіденційності й контакти.

Інший сервіс (Xsolla, monobank для ФОП — реалізація monobank є в історії git, коміт `e93d7fd`) — це ще
один клас, що реалізує `PaymentProvider` (`createInvoice`, `status`) і перевіряє підпис своїх повідомлень,
як `server/paddle.ts`. Журнал покупок і зарахування лишаються тими самими.
