import { useState } from 'react';
import type { Api, Profile } from '../api/client';
import { cardArt, packArt } from './cardArt';
import { errorText } from './state';
import { ForgotForm, NAME_HINT } from './AccountPages';
import { NAME_MAX, PASSWORD_MIN } from '../economy/account';
import { t } from '../i18n';
import { LangSelect } from './LangSelect';

export function AuthPage({ api, onAuth }: { api: Api; onAuth: (p: Profile) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('register');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAuth(mode === 'login' ? await api.login(email, password) : await api.register(email, password, name));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-lang">
        <LangSelect compact />
      </div>
      <div className="auth-hero">
        <div className="auth-art">
          {['king-classic', 'queen-levitation', 'knight-berserk', 'rook-castle', 'bishop-piercer'].map((id, i) => (
            <img key={id} src={cardArt(id)!} alt="" className={`auth-piece ap-${i}`} />
          ))}
          <img src={packArt('legendary')} alt="" className="auth-pack" />
        </div>
        <h1 className="logo">
          Ultra<b>chess</b>
        </h1>
        <p className="auth-tagline">{t('Шахи, де кожна фігура — унікальна. Відкривай паки, збирай колоду, піднімайся аренами.')}</p>
      </div>

      {mode === 'forgot' ? (
        <ForgotForm api={api} initialEmail={email} onBack={() => setMode('login')} />
      ) : (
      <form className="auth-card" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            {t('Реєстрація')}
          </button>
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            {t('Вхід')}
          </button>
        </div>
        {mode === 'register' && (
          <label className="field">
            <span>{t('Нікнейм')}</span>
            <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder={t('Як вас звати на арені')} />
            <small className="muted tiny">{NAME_HINT}</small>
          </label>
        )}
        <label className="field">
          <span>{t('Пошта')}</span>
          <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>{t('Пароль')}</span>
          <input
            id="auth-password"
            type="password"
            required
            minLength={mode === 'register' ? PASSWORD_MIN : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block-c" disabled={busy}>
          {mode === 'login' ? t('Увійти') : t('Створити акаунт')}
        </button>
        {mode === 'login' && (
          <button type="button" className="btn btn-ghost btn-sm btn-block-c" onClick={() => setMode('forgot')}>
            {t('Забули пароль?')}
          </button>
        )}
        <p className="muted tiny center legal-links">
          <a href="#/terms">{t('Умови продажу')}</a> · <a href="#/privacy">{t('Конфіденційність')}</a>
        </p>
        {api.mode === 'local' && (
          <p className="muted small center demo-note">{t('Демо без сервера: акаунти й колекція зберігаються лише в цьому браузері.')}</p>
        )}
      </form>
      )}
    </div>
  );
}
