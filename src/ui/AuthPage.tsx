import { useState } from 'react';
import type { Api, Profile } from '../api/client';
import { cardArt, packArt } from './cardArt';
import { errorText } from './state';

export function AuthPage({ api, onAuth }: { api: Api; onAuth: (p: Profile) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
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
        <p className="auth-tagline">Шахи, де кожна фігура — картка. Відкривай паки, збирай колоду, піднімайся аренами.</p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            Реєстрація
          </button>
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            Вхід
          </button>
        </div>
        {mode === 'register' && (
          <label className="field">
            <span>Нікнейм</span>
            <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Як вас звати на арені" />
          </label>
        )}
        <label className="field">
          <span>Пошта</span>
          <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input
            id="auth-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block-c" disabled={busy}>
          {mode === 'login' ? 'Увійти' : 'Створити акаунт'}
        </button>
        {mode === 'register' && <p className="muted small center">Після реєстрації — стартовий пак: по одній картці кожної фігури.</p>}
        {api.mode === 'local' && (
          <p className="muted small center demo-note">Демо без сервера: акаунти й колекція зберігаються лише в цьому браузері.</p>
        )}
      </form>
    </div>
  );
}
