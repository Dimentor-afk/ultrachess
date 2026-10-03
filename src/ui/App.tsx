import { type CSSProperties, Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { type Api, type Profile, createApi } from '../api/client';
import { AuthPage } from './AuthPage';
import { LinkPage } from './AccountPages';
import { LegalPage } from './LegalPage';
import { DeckPage } from './DeckPage';
import { HomePage } from './HomePage';
import { ShopPage } from './ShopPage';
import { Avatar } from './common';
import { themeById } from '../economy/themes';
import { cardArt } from './cardArt';
import { ErrorBoundary } from './ErrorBoundary';
import { Icon } from './icons';
import { currentPath, navigate, onNavigate, useRoutePath } from './router';
import { LeaguesPage } from './LeaguesPage';
import { TrialsPage } from './TrialsPage';
import { type Loaded, SessionProvider, type Toast, errorText, loadAll, useSession } from './state';
import { t } from '../i18n';

// Pages off the main path load on first visit, which keeps the first download smaller.
const AdminPage = lazy(() => import('./AdminPage').then((m) => ({ default: m.AdminPage })));
const LeaderboardPage = lazy(() => import('./LeaderboardPage').then((m) => ({ default: m.LeaderboardPage })));
const FriendsPage = lazy(() => import('./FriendsPage').then((m) => ({ default: m.FriendsPage })));
const ProfilePage = lazy(() => import('./ProfilePage').then((m) => ({ default: m.ProfilePage })));
const HelpPage = lazy(() => import('./HelpPage').then((m) => ({ default: m.HelpPage })));
const GamePage = lazy(() => import('./GamePage').then((m) => ({ default: m.GamePage })));
const TestPayPage = lazy(() => import('./Payments').then((m) => ({ default: m.TestPayPage })));
const PaddlePayPage = lazy(() => import('./Payments').then((m) => ({ default: m.PaddlePayPage })));

type Route = 'play' | 'leagues' | 'trials' | 'deck' | 'shop' | 'friends' | 'top' | 'admin' | 'profile' | 'help' | 'game' | 'pay';

const ROUTES: { id: Route; label: string; icon: string; admin?: boolean }[] = [
  { id: 'play', label: t('Грати'), icon: 'play' },
  { id: 'leagues', label: t('Ліги'), icon: 'ladder' },
  { id: 'trials', label: t('Випробування'), icon: 'medal' },
  { id: 'deck', label: t('Колода'), icon: 'cards' },
  { id: 'shop', label: t('Магазин'), icon: 'shop' },
  { id: 'friends', label: t('Друзі'), icon: 'users' },
  { id: 'top', label: t('Рейтинг'), icon: 'trophy' },
  { id: 'admin', label: t('Адмін'), icon: 'shield', admin: true },
];

/** Phone tab bar: five tabs, "Грати" in the middle. Ліги also covers trials and the leaderboard. */
const TABS: { id: Route; label: string; icon: string; covers?: Route[] }[] = [
  { id: 'shop', label: t('Магазин'), icon: 'shop' },
  { id: 'deck', label: t('Колода'), icon: 'cards' },
  { id: 'play', label: t('Грати'), icon: 'play' },
  { id: 'friends', label: t('Друзі'), icon: 'users' },
  { id: 'leagues', label: t('Ліги'), icon: 'trophy', covers: ['trials', 'top'] },
];

/** On phones the Ліги tab holds three pages; this strip switches between them. */
const ARENA: { id: Route; label: string }[] = [
  { id: 'leagues', label: t('Ліги') },
  { id: 'trials', label: t('Випробування') },
  { id: 'top', label: t('Рейтинг') },
];

function readRoute(): Route {
  const h = currentPath().replace(/^\/?/, '').split('/')[0];
  if (h === 'cards') return 'deck'; // the old collection page lives on the deck page now
  if (h === 'profile' || h === 'help' || h === 'game' || h === 'pay') return h;
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
  // Links from letters (#/reset/…, #/verify/…) open before anything else, signed in or not.
  const path = useRoutePath();
  const link = /^\/?(reset|verify)\/([a-f0-9]{64})$/.exec(path);
  // The offer and privacy policy are public: the bank checks them without an account.
  const legal = /^\/?(terms|privacy)$/.exec(path)?.[1] as 'terms' | 'privacy' | undefined;
  const leaveLink = async (p: Profile | null) => {
    // Load first, then leave: the session screen starts from this fresh profile (the e-mail now confirmed).
    const me = p ?? (await api!.me().catch(() => null));
    setLoaded(me ? await loadAll(api!, me) : 'anon');
    navigate('/play');
  };

  return (
    <>
      {!api || loaded === null ? (
        <div className="splash">
          <img src={cardArt('knight-galloper')!} alt="" className="pixel splash-art" />
          <span className="logo">
            Ultra<b>chess</b>
          </span>
        </div>
      ) : legal ? (
        <LegalPage page={legal} />
      ) : link ? (
        <LinkPage key={path} api={api} kind={link[1] as 'reset' | 'verify'} token={link[2]} onDone={leaveLink} />
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
    return onNavigate(() => setRoute(readRoute()));
  }, []);
  // A new section opens at its top, not wherever the last one was scrolled to.
  // Braces matter: an effect must not return scrollTo's result. Some hosts (the
  // claude.ai frame) wrap scrollTo so it returns a value, and React would call
  // that value as a cleanup function on the next route change and crash.
  useEffect(() => {
    try {
      window.scrollTo(0, 0);
    } catch {
      // Scrolling is a nicety.
    }
  }, [route]);
  const routes = ROUTES.filter((r) => !r.admin || s.profile.role === 'admin');
  const readyPacks = s.packs.length;
  const social = s.inbox.friendRequests + s.inbox.challenges + s.inbox.yourTurn;
  const theme = themeById(s.profile.boardTheme);

  const badge = (id: Route) =>
    id === 'play' && readyPacks > 0 ? readyPacks : id === 'friends' && social > 0 ? social : 0;

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
              {badge(r.id) > 0 && <span className="nav-badge">{badge(r.id)}</span>}
            </a>
          ))}
        </nav>
        <a className={`nav-help ${route === 'help' ? 'active' : ''}`} href="#/help">
          <Icon name="info" /> {t('Як грати')}
        </a>
        <a className={`me ${route === 'profile' ? 'active' : ''}`} href="#/profile" title={t('Профіль')}>
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

      {/* Phones: profile, wallet and help on top; five tabs at the bottom. */}
      <header className="m-header">
        <a className={`m-me ${route === 'profile' ? 'active' : ''}`} href="#/profile" aria-label={t('Профіль')}>
          <Avatar card={s.profile.avatar} size="sm" />
          <span className="m-me-info">
            <b>{s.profile.name}</b>
            <small>🏆 {s.profile.trophies}</small>
          </span>
        </a>
        <a href="#/shop" className="wallet-item gold" aria-label={t('Золото: {0}', s.profile.gold)}>
          🪙 <b>{s.profile.gold}</b>
        </a>
        <a href="#/shop" className="wallet-item shards" aria-label={t('Уламки: {0}', s.profile.shards)}>
          💎 <b>{s.profile.shards}</b>
        </a>
        <a className={`m-help ${route === 'help' ? 'active' : ''}`} href="#/help" aria-label={t('Як грати')}>
          ?
        </a>
      </header>
      <nav className="tabbar" aria-label={t('Розділи')}>
        {TABS.map((t) => {
          const on = route === t.id || !!t.covers?.includes(route);
          return (
            <a key={t.id} href={`#/${t.id}`} className={`tab tab-${t.id} ${on ? 'on' : ''}`} aria-current={on ? 'page' : undefined}>
              <span className="tab-icon">
                <Icon name={t.icon} />
                {badge(t.id) > 0 && <span className="nav-badge">{badge(t.id)}</span>}
              </span>
              <span className="tab-label">{t.label}</span>
            </a>
          );
        })}
      </nav>

      <main className="content">
        <div className="wallet" aria-label={t('Гаманець')}>
          <a href="#/shop" className="wallet-item gold" title={t('Золото: купує дошки й ефекти в магазині')}>
            🪙 <b>{s.profile.gold}</b>
          </a>
          <a href="#/shop" className="wallet-item shards" title={t('Уламки: з повторок, купують паки')}>
            💎 <b>{s.profile.shards}</b>
          </a>
        </div>
        {ARENA.some((a) => a.id === route) && (
          <nav className="m-subnav" aria-label={t('Змагання')}>
            {ARENA.map((a) => (
              <a key={a.id} href={`#/${a.id}`} className={route === a.id ? 'on' : ''}>
                {a.label}
              </a>
            ))}
          </nav>
        )}
        {/* A page that crashes shows its error; the menu stays and another tab starts clean. */}
        <ErrorBoundary key={route}>
          <Suspense fallback={<p className="muted page-loading">{t('Завантаження…')}</p>}>
          {route === 'play' && <HomePage />}
          {route === 'leagues' && <LeaguesPage />}
          {route === 'trials' && <TrialsPage />}
          {route === 'deck' && <DeckPage />}
          {route === 'shop' && <ShopPage />}
          {route === 'friends' && <FriendsPage />}
          {route === 'profile' && <ProfilePage />}
          {route === 'help' && <HelpPage />}
          {route === 'game' && <GamePage />}
          {route === 'pay' && currentPath().split('/')[2] === 'paddle' && (
            <PaddlePayPage purchaseId={currentPath().split('/')[3] ?? ''} transactionId={currentPath().split('/')[4] ?? ''} />
          )}
          {route === 'pay' && currentPath().split('/')[2] !== 'paddle' && <TestPayPage id={currentPath().split('/')[3] ?? ''} />}
          {route === 'top' && <LeaderboardPage />}
          {route === 'admin' && s.profile.role === 'admin' && <AdminPage />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
