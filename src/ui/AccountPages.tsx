import { useEffect, useState } from 'react';
import type { Api, MailSent, Profile } from '../api/client';
import { NAME_MAX, PASSWORD_MIN, passwordProblem } from '../economy/account';
import { Icon } from './icons';
import { navigate } from './router';
import { errorText, useSession } from './state';

/** The route inside a link from a letter ("…#/reset/<token>"), for the demo's "open the link" button. */
function linkRoute(link: string): string {
  return link.slice(link.indexOf('#') + 1);
}

/** What was "sent": on the server a note to check the inbox; in the demo the link itself. */
export function MailNote({ mail, what }: { mail: MailSent; what: string }) {
  return (
    <div className="mail-note" role="status">
      <p>
        <Icon name="info" /> {mail.link ? `У демо листів немає — ось посилання, яке прийшло б на пошту (${what}).` : `Перевірте пошту: ми надіслали лист (${what}). Якщо його немає, загляньте в «Спам».`}
      </p>
      {mail.link && (
        <button type="button" className="btn btn-sm" onClick={() => navigate(linkRoute(mail.link!))}>
          Відкрити посилання з листа
        </button>
      )}
    </div>
  );
}

/** "Forgot password" on the sign-in screen. */
export function ForgotForm({ api, initialEmail, onBack }: { api: Api; initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<MailSent | null>(null);
  return (
    <form
      className="auth-card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          setSent(await api.forgotPassword(email));
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Відновлення пароля</h2>
      {sent ? (
        <>
          {api.mode === 'local' && !sent.link ? (
            <p className="muted">Акаунта з цією поштою в цьому браузері немає.</p>
          ) : (
            <MailNote mail={sent} what="посилання для нового пароля, діє 1 годину" />
          )}
          {api.mode === 'server' && <p className="muted small">Лист приходить, лише якщо акаунт із цією поштою існує.</p>}
        </>
      ) : (
        <>
          <p className="muted small">Вкажіть пошту акаунта: ми надішлемо посилання, за яким можна задати новий пароль.</p>
          <label className="field">
            <span>Пошта</span>
            <input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block-c" disabled={busy}>
            Надіслати посилання
          </button>
        </>
      )}
      <button type="button" className="btn btn-ghost btn-sm btn-block-c" onClick={onBack}>
        ← Назад до входу
      </button>
    </form>
  );
}

/**
 * A link from a letter: #/reset/<token> (new password) or #/verify/<token>
 * (confirm the e-mail). Works signed in or not.
 */
export function LinkPage({ api, kind, token, onDone }: { api: Api; kind: 'reset' | 'verify'; token: string; onDone: (p: Profile | null) => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== 'verify') return;
    api.verifyEmail(token).then(
      (r) => setVerified(r.email),
      (e) => setError(errorText(e)),
    );
  }, [api, kind, token]);

  if (kind === 'verify') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h2>Підтвердження пошти</h2>
          {verified ? <p>✅ Пошту {verified} підтверджено. Тепер через неї можна відновити пароль.</p> : error ? <p className="error-text">{error}</p> : <p className="muted">Перевіряємо посилання…</p>}
          <button className="btn btn-primary btn-block-c" onClick={() => onDone(null)} disabled={!verified && !error}>
            До гри
          </button>
        </div>
      </div>
    );
  }

  const weak = password ? passwordProblem(password) : null;
  return (
    <div className="auth-screen">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== repeat) return setError('Паролі не збігаються.');
          setBusy(true);
          setError(null);
          try {
            onDone(await api.resetPassword(token, password));
          } catch (err) {
            setError(errorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Новий пароль</h2>
        <p className="muted small">Після зміни пароля всі інші пристрої вийдуть з акаунта.</p>
        <label className="field">
          <span>Новий пароль</span>
          <input id="reset-password" type="password" required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Ще раз</span>
          <input id="reset-repeat" type="password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
        </label>
        {(error || weak) && <p className="error-text">{error ?? weak}</p>}
        <button className="btn btn-primary btn-lg btn-block-c" disabled={busy || !!weak}>
          Зберегти й увійти
        </button>
        <button type="button" className="btn btn-ghost btn-sm btn-block-c" onClick={() => onDone(null)}>
          Скасувати
        </button>
      </form>
    </div>
  );
}

type Open = null | 'password' | 'email' | 'delete';

/** Profile → Акаунт: e-mail and its confirmation, password, sessions, deletion. */
export function AccountPanel() {
  const s = useSession();
  const p = s.profile;
  const [open, setOpen] = useState<Open>(null);
  const [mail, setMail] = useState<MailSent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [email, setEmail] = useState('');
  const [confirm, setConfirm] = useState('');

  const toggle = (o: Open) => {
    setOpen(open === o ? null : o);
    setError(null);
    setCurrent('');
    setNext('');
    setEmail('');
    setConfirm('');
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const weak = next ? passwordProblem(next, p.email) : null;

  return (
    <div className="panel account">
      <h2>Акаунт</h2>
      <div className="setting-row">
        <span>
          <b>Пошта</b>
          <small className="muted">
            {p.email} · {p.emailVerified ? <span className="ok-text">підтверджено</span> : <span className="warn-text">не підтверджено</span>}
          </small>
        </span>
        <span className="account-actions">
          {!p.emailVerified && (
            <button
              className="btn btn-sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setMail(await s.api.sendVerification());
                })
              }
            >
              Надіслати лист
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => toggle('email')}>
            Змінити
          </button>
        </span>
      </div>
      {mail && <MailNote mail={mail} what="підтвердження пошти" />}
      {!p.emailVerified && !mail && <p className="muted tiny">Підтверджена пошта потрібна, щоб відновити пароль, якщо ви його забудете.</p>}

      {open === 'email' && (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await s.api.changeEmail(current, email);
              s.setProfile(r.profile);
              setMail(r.mail);
              setOpen(null);
              s.toast('Пошту змінено. Підтвердьте нову адресу.');
            });
          }}
        >
          <label className="field">
            <span>Нова пошта</span>
            <input id="acc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="field">
            <span>Поточний пароль</span>
            <input id="acc-email-password" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-sm" disabled={busy}>
            Змінити пошту
          </button>
        </form>
      )}

      <div className="setting-row">
        <span>
          <b>Пароль</b>
          <small className="muted">Після зміни інші пристрої вийдуть з акаунта</small>
        </span>
        <button className="btn btn-sm btn-ghost" onClick={() => toggle('password')}>
          Змінити
        </button>
      </div>
      {open === 'password' && (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await s.api.changePassword(current, next);
              setOpen(null);
              s.toast('Пароль змінено. Інші пристрої вийшли з акаунта.');
            });
          }}
        >
          <label className="field">
            <span>Поточний пароль</span>
            <input id="acc-current" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>Новий пароль</span>
            <input id="acc-next" type="password" required minLength={PASSWORD_MIN} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          {(error || weak) && <p className="error-text">{error ?? weak}</p>}
          <button className="btn btn-primary btn-sm" disabled={busy || !!weak}>
            Зберегти пароль
          </button>
        </form>
      )}

      <div className="setting-row">
        <span>
          <b>Інші пристрої</b>
          <small className="muted">Загубили телефон чи входили на чужому комп’ютері</small>
        </span>
        <button
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await s.api.logoutOthers();
              s.toast('Усі інші пристрої вийшли з акаунта.');
            })
          }
        >
          Вийти на всіх інших
        </button>
      </div>

      <div className="setting-row">
        <span>
          <b>Видалити акаунт</b>
          <small className="muted">Назавжди: колекція, кубки й друзі зникнуть</small>
        </span>
        <button className="btn btn-sm btn-danger" onClick={() => toggle('delete')}>
          Видалити…
        </button>
      </div>
      {open === 'delete' && (
        <form
          className="account-form danger-zone"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await s.api.deleteAccount(current);
              s.toast('Акаунт видалено.');
              await s.logout().catch(() => undefined);
            });
          }}
        >
          <p className="small">
            Відкриті партії буде здано, друзів і виклики видалено, пошту й нікнейм стерто. Скасувати це неможливо. Введіть пароль і слово <b>ВИДАЛИТИ</b>.
          </p>
          <label className="field">
            <span>Пароль</span>
            <input id="acc-delete-password" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>Слово ВИДАЛИТИ</span>
            <input id="acc-delete-confirm" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-danger btn-sm" disabled={busy || confirm.trim().toUpperCase() !== 'ВИДАЛИТИ'}>
            Видалити назавжди
          </button>
        </form>
      )}
    </div>
  );
}

/** Rules shown under the nickname field. */
export const NAME_HINT = `3–${NAME_MAX} символів: літери, цифри, пробіл, _ . -`;
