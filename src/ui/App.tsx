import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { type Api, type Profile, createApi } from '../api/client';
import { AdminPage } from './AdminPage';
import { AuthPage } from './AuthPage';
import { DeckPage } from './DeckPage';
import { HomePage } from './HomePage';
import { LeaderboardPage } from './LeaderboardPage';
import { ShopPage } from './ShopPage';
import { FriendsPage } from './FriendsPage';
import { ProfilePage } from './ProfilePage';
import { HelpPage } from './HelpPage';
import { Avatar } from './common';
import { themeById } from '../economy/themes';
import { cardArt } from './cardArt';
import { Icon } from './icons';
import { type Loaded, SessionProvider, type Toast, errorText, loadAll, useSession } from './state';

type Route = 'play' | 'deck' | 'shop' | 'friends' | 'top' | 'admin' | 'profile' | 'help';

const ROUTES: { id: Route; label: string; icon: string; admin?: boolean }[] = [
  { id: 'play', label: 'Грати', icon: 'play' },
  { id: 'deck', label: 'Колода', icon: 'cards' },
  { id: 'shop', label: 'Магазин', icon: 'shop' },
  { id: 'friends', label: 'Друзі', icon: 'users' },
  { id: 'top', label: 'Рейтинг', icon: 'trophy' },
  { id: 'admin', label: 'Адмін', icon: 'shield', admin: true },
];

function readRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  if (h === 'cards') return 'deck'; // the old collection page lives on the deck page now
  if (h === 'profile' || h === 'help') return h;
  return ROUTES.find((r) => r.id === h)?.id ?? 'play';
}

export function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null | 'anon'>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  useEffect(() => {
    (async () => {
      const a = await createApi();
      setApi(a);
      const me = await a.me().catch(() => null);
      setLoaded(me ? await loadAll(a, me) : 'anon');
    })().catch((e) => {
      toast(errorText(e), 'error');
      setLoaded('anon');
    });
  }, [toast]);

  const onAuth = async (p: Profile) => setLoaded(await loadAll(api!, p));

  return (
    <>
      {!api || loaded === null ? (
        <div className="splash">
          <img src={cardArt('knight-galloper')!} alt="" className="pixel splash-art" />
          <span className="logo">
            Ultra<b>chess</b>
          </span>
        </div>
      ) : loaded === 'anon' ? (
        <AuthPage api={api} onAuth={onAuth} />
      ) : (
        <SessionProvider api={api} initial={loaded} onLogout={() => setLoaded('anon')} toast={toast}>
          <Shell />
        </SessionProvider>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

function Shell() {
  const s = useSession();
  // An unopened starter pack takes the player home, where it opens by itself.
  const [route, setRoute] = useState<Route>(() => (s.packs.some((p) => p.type === 'starter') ? 'play' : readRoute()));
  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const routes = ROUTES.filter((r) => !r.admin || s.profile.role === 'admin');
  const readyPacks = s.packs.length;
  const social = s.inbox.friendRequests + s.inbox.challenges + s.inbox.yourTurn;
  const theme = themeById(s.profile.boardTheme);

  return (
    <div className="shell" style={{ '--light-sq': theme.light, '--dark-sq': theme.dark } as CSSProperties}>
      <aside className="sidebar">
        <a className="brand" href="#/play">
          <img src={cardArt('knight-galloper')!} alt="" className="pixel brand-art" />
          <span>
            Ultra<b>chess</b>
          </span>
        </a>
        <nav className="nav">
          {routes.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className={route === r.id ? 'active' : ''}>
              <Icon name={r.icon} />
              <span>{r.label}</span>
              {r.id === 'play' && readyPacks > 0 && <span className="nav-badge">{readyPacks}</span>}
              {r.id === 'friends' && social > 0 && <span className="nav-badge">{social}</span>}
            </a>
          ))}
        </nav>
        <a className={`nav-help ${route === 'help' ? 'active' : ''}`} href="#/help">
          <Icon name="info" /> Як грати
        </a>
        <a className={`me ${route === 'profile' ? 'active' : ''}`} href="#/profile" title="Профіль">
          <Avatar card={s.profile.avatar} />
          <span className="me-info">
            <b>{s.profile.name}</b>
            <small>🏆 {s.profile.trophies}</small>
          </span>
          <span className="me-chev" aria-hidden="true">
            ›
          </span>
        </a>
      </aside>
      <main className="content">
        <div className="wallet" aria-label="Гаманець">
          <a href="#/shop" className="wallet-item gold" title="Золото: купує дошки в магазині">
            🪙 <b>{s.profile.gold}</b>
          </a>
          <a href="#/shop" className="wallet-item shards" title="Осколки: з повторок, купують паки">
            💎 <b>{s.profile.shards}</b>
          </a>
        </div>
        {route === 'play' && <HomePage />}
        {route === 'deck' && <DeckPage />}
        {route === 'shop' && <ShopPage />}
        {route === 'friends' && <FriendsPage />}
        {route === 'profile' && <ProfilePage />}
        {route === 'help' && <HelpPage />}
        {route === 'top' && <LeaderboardPage />}
        {route === 'admin' && s.profile.role === 'admin' && <AdminPage />}
      </main>
    </div>
  );
}
