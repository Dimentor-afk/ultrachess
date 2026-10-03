import { useEffect, useState } from 'react';
import type { PvpState } from '../api/client';
import { PvpGame } from './PvpGame';
import { navigate, useRoutePath } from './router';
import { errorText, useSession } from './state';
import { t } from '../i18n';

/**
 * A game room: #/game/<id>. Its players come back to the game here (after a
 * reload or from another device); anyone else with the link watches it.
 */
export function GamePage() {
  const s = useSession();
  const id = useRoutePath().split('/')[2] ?? '';
  const [pvp, setPvp] = useState<PvpState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    setPvp(null);
    setError(null);
    s.api
      .pvpState(id)
      .then((g) => !stop && setPvp(g))
      .catch((e) => !stop && setError(errorText(e)));
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) {
    return (
      <section className="page">
        <div className="panel">
          <h1>{t('Партію не знайдено')}</h1>
          <p className="muted">{error}</p>
          <a className="btn btn-primary" href="#/play">
            {t('На головну')}
          </a>
        </div>
      </section>
    );
  }
  if (!pvp) return <p className="muted page-loading">{t('Відкриваємо партію…')}</p>;
  return (
    <PvpGame
      key={pvp.id}
      pvp={pvp}
      onExit={() => {
        void s.refreshInbox();
        navigate(pvp.ranked || pvp.color === null ? '/play' : '/friends');
      }}
      onRematch={pvp.ranked && pvp.color ? () => navigate('/play/seek') : undefined}
    />
  );
}
