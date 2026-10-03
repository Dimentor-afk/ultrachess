import { useEffect, useState } from 'react';
import type { Api, MailSent, Profile } from '../api/client';
import { NAME_MAX, PASSWORD_MIN, passwordProblem } from '../economy/account';
import { Icon } from './icons';
import { navigate } from './router';
import { errorText, useSession } from './state';
import { t } from '../i18n';

/** The route inside a link from a letter ("…#/reset/<token>"), for the demo's "open the link" button. */
function linkRoute(link: string): string {
  return link.slice(link.indexOf('#') + 1);
}

/** What was "sent": on the server a note to check the inbox; in the demo the link itself. */
export function MailNote({ mail, what }: { mail: MailSent; what: string }) {
  return (
    <div className="mail-note" role="status">
      <p>
        <Icon name="info" /> {mail.link ? t('У демо листів немає — ось посилання, яке прийшло б на пошту ({0}).', what) : t('Перевірте пошту: ми надіслали лист ({0}). Якщо його немає, загляньте в «Спам».', what)}
      </p>
      {mail.link && (
        <button type="button" className="btn btn-sm" onClick={() => navigate(linkRoute(mail.link!))}>
          {t('Відкрити посилання з листа')}
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
      <h2>{t('Відновлення пароля')}</h2>
      {sent ? (
        <>
          {api.mode === 'local' && !sent.link ? (
            <p className="muted">{t('Акаунта з цією поштою в цьому браузері немає.')}</p>
          ) : (
            <MailNote mail={sent} what={t('посилання для нового пароля, діє 1 годину')} />
          )}
          {api.mode === 'server' && <p className="muted small">{t('Лист приходить, лише якщо акаунт із цією поштою існує.')}</p>}
        </>
      ) : (
        <>
          <p className="muted small">{t('Вкажіть пошту акаунта: ми надішлемо посилання, за яким можна задати новий пароль.')}</p>
          <label className="field">
            <span>{t('Пошта')}</span>
            <input id="forgot-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-lg btn-block-c" disabled={busy}>
            {t('Надіслати посилання')}
          </button>
        </>
      )}
      <button type="button" className="btn btn-ghost btn-sm btn-block-c" onClick={onBack}>
        {t('← Назад до входу')}
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
          <h2>{t('Підтвердження пошти')}</h2>
          {verified ? <p>{t('✅ Пошту {0} підтверджено. Тепер через неї можна відновити пароль.', verified)}</p> : error ? <p className="error-text">{error}</p> : <p className="muted">{t('Перевіряємо посилання…')}</p>}
          <button className="btn btn-primary btn-block-c" onClick={() => onDone(null)} disabled={!verified && !error}>
            {t('До гри')}
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
          if (password !== repeat) return setError(t('Паролі не збігаються.'));
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
        <h2>{t('Новий пароль')}</h2>
        <p className="muted small">{t('Після зміни пароля всі інші пристрої вийдуть з акаунта.')}</p>
        <label className="field">
          <span>{t('Новий пароль')}</span>
          <input id="reset-password" type="password" required minLength={PASSWORD_MIN} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="field">
          <span>{t('Ще раз')}</span>
          <input id="reset-repeat" type="password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
        </label>
        {(error || weak) && <p className="error-text">{error ?? weak}</p>}
        <button className="btn btn-primary btn-lg btn-block-c" disabled={busy || !!weak}>
          {t('Зберегти й увійти')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm btn-block-c" onClick={() => onDone(null)}>
          {t('Скасувати')}
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
      <h2>{t('Акаунт')}</h2>
      <div className="setting-row">
        <span>
          <b>{t('Пошта')}</b>
          <small className="muted">
            {p.email} · {p.emailVerified ? <span className="ok-text">{t('підтверджено')}</span> : <span className="warn-text">{t('не підтверджено')}</span>}
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
              {t('Надіслати лист')}
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => toggle('email')}>
            {t('Змінити')}
          </button>
        </span>
      </div>
      {mail && <MailNote mail={mail} what={t('підтвердження пошти')} />}
      {!p.emailVerified && !mail && <p className="muted tiny">{t('Підтверджена пошта потрібна, щоб відновити пароль, якщо ви його забудете.')}</p>}

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
              s.toast(t('Пошту змінено. Підтвердьте нову адресу.'));
            });
          }}
        >
          <label className="field">
            <span>{t('Нова пошта')}</span>
            <input id="acc-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="field">
            <span>{t('Поточний пароль')}</span>
            <input id="acc-email-password" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {t('Змінити пошту')}
          </button>
        </form>
      )}

      <div className="setting-row">
        <span>
          <b>{t('Пароль')}</b>
          <small className="muted">{t('Після зміни інші пристрої вийдуть з акаунта')}</small>
        </span>
        <button className="btn btn-sm btn-ghost" onClick={() => toggle('password')}>
          {t('Змінити')}
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
              s.toast(t('Пароль змінено. Інші пристрої вийшли з акаунта.'));
            });
          }}
        >
          <label className="field">
            <span>{t('Поточний пароль')}</span>
            <input id="acc-current" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>{t('Новий пароль')}</span>
            <input id="acc-next" type="password" required minLength={PASSWORD_MIN} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          {(error || weak) && <p className="error-text">{error ?? weak}</p>}
          <button className="btn btn-primary btn-sm" disabled={busy || !!weak}>
            {t('Зберегти пароль')}
          </button>
        </form>
      )}

      <div className="setting-row">
        <span>
          <b>{t('Інші пристрої')}</b>
          <small className="muted">{t('Загубили телефон чи входили на чужому комп’ютері')}</small>
        </span>
        <button
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await s.api.logoutOthers();
              s.toast(t('Усі інші пристрої вийшли з акаунта.'));
            })
          }
        >
          {t('Вийти на всіх інших')}
        </button>
      </div>

      <div className="setting-row">
        <span>
          <b>{t('Видалити акаунт')}</b>
          <small className="muted">{t('Назавжди: колекція, кубки й друзі зникнуть')}</small>
        </span>
        <button className="btn btn-sm btn-danger" onClick={() => toggle('delete')}>
          {t('Видалити…')}
        </button>
      </div>
      {open === 'delete' && (
        <form
          className="account-form danger-zone"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await s.api.deleteAccount(current);
              s.toast(t('Акаунт видалено.'));
              await s.logout().catch(() => undefined);
            });
          }}
        >
          <p className="small">
            {t('Відкриті партії буде здано, друзів і виклики видалено, пошту й нікнейм стерто. Скасувати це неможливо. Введіть пароль і слово')}{' '}<b>{t('ВИДАЛИТИ')}</b>.
          </p>
          <label className="field">
            <span>{t('Пароль')}</span>
            <input id="acc-delete-password" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>{t('Слово {0}', t('ВИДАЛИТИ'))}</span>
            <input id="acc-delete-confirm" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-danger btn-sm" disabled={busy || confirm.trim().toUpperCase() !== t('ВИДАЛИТИ').toUpperCase()}>
            {t('Видалити назавжди')}
          </button>
        </form>
      )}
    </div>
  );
}

/** Rules shown under the nickname field. */
export const NAME_HINT = t('3–{0} символів: літери, цифри, пробіл, _ . -', NAME_MAX);
