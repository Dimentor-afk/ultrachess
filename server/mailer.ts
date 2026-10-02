// Letters (password reset, e-mail confirmation) through Resend's HTTP API
// (https://resend.com): RESEND_API_KEY and MAIL_FROM, e.g.
// MAIL_FROM="Ultrachess <no-reply@your-domain>". Without a key the server
// writes the links to its log instead, which is enough on a laptop.

import type { Mailer } from '../src/economy/service';

export function resendMailer(): Mailer | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  const from = process.env.MAIL_FROM ?? 'Ultrachess <onboarding@resend.dev>';
  return async (mail) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  };
}
