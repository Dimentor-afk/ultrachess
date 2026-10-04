import { useEffect, useState } from 'react';
import { AchievementInfo, Medal, TitlePlate, rarityText } from './Achievements';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS } from '../economy/achievements';
import { DECK_SLOTS } from '../engine/deck';
import { getCard } from '../engine/cards';
import { CardModal } from './CardModal';
import { CardArt } from './common';
import type { PublicProfile } from '../api/client';
import { CARDS } from '../engine/cards';
import { Avatar } from './common';
import { errorText, useSession } from './state';
import { t, tr } from '../i18n';

/** Another player's public profile, with the friend action that fits. */
export function PlayerModal({
  userId,
  onClose,
  onChanged,
  remove,
}: {
  userId: string;
  onClose: () => void;
  onChanged?: () => void;
  remove?: () => void;
}) {
  const s = useSession();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [percent, setPercent] = useState<Record<string, number>>({});
  const [card, setCard] = useState<string | null>(null);
  const [allAch, setAllAch] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  useEffect(() => {
    // How rare each achievement is (the same list as on your own profile).
    s.api.achievements().then((l) => setPercent(Object.fromEntries(l.map((a) => [a.id, a.percent ?? 0]))), () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = () => s.api.playerProfile(userId).then(setP, (e) => s.toast(errorText(e), 'error'));
  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const add = async () => {
    try {
      await s.api.addFriend(userId);
      s.toast(p?.relation === 'incoming' ? t('Тепер ви друзі!') : t('Заявку надіслано.'));
      await load();
      onChanged?.();
      void s.refreshInbox();
    } catch (e) {
      s.toast(errorText(e), 'error');
    }
  };

  const games = p ? p.wins + p.losses + p.draws : 0;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal player-modal" role="dialog" aria-label={t('Профіль гравця')} onClick={(e) => e.stopPropagation()}>
        {!p ? (
          <p className="muted">{t('Завантаження…')}</p>
        ) : (
          <>
            <div className="player-modal-head">
              <span className="avatar-wrap">
                <Avatar card={p.avatar} size="lg" />
                <span className={`presence ${p.online ? 'on' : ''}`} />
              </span>
              <div>
                <h2>{p.name}</h2>
                <TitlePlate id={p.title} />
                <span className="tag-chip">#{p.tag}</span>
              </div>
            </div>
            <div className="stat-grid compact">
              <div className="stat">
                <b>🏆 {p.trophies}</b>
                <span>{tr(p.arena)}</span>
              </div>
              <div className="stat">
                <b>{p.bestTrophies}</b>
                <span>{t('рекорд')}</span>
              </div>
              <div className="stat">
                <b>{games ? Math.round((p.wins / games) * 100) : 0}%</b>
                <span>
                  {p.wins}/{p.losses}/{p.draws}
                </span>
              </div>
              <div className="stat">
                <b>
                  {p.cards}/{CARDS.length}
                </b>
                <span>{t('карток')}</span>
              </div>
            </div>
            {p.deck && (
              <div className="pm-section">
                <h3>{t('Остання колода')}</h3>
                <div className="pm-deck">
                  {[...p.deck.pawnVersions, ...DECK_SLOTS.map((sl) => p.deck![sl.key] as string)]
                    .filter((id, i, all) => id && getCard(id) && all.indexOf(id) === i)
                    .map((id) => (
                      <button key={id} className={`pm-card r-${getCard(id).rarity}`} title={getCard(id).name} onClick={() => setCard(id)}>
                        <CardArt cardId={id} />
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="pm-section">
              <h3>
                {t('Досягнення')} <span className="muted small">🏆 {p.achievements.length}/{ACHIEVEMENTS.length}</span>
              </h3>
              {p.achievements.length === 0 ? (
                <p className="muted small">{t('Ще жодного.')}</p>
              ) : (
                <div className="pm-ach">
                  {(allAch
                    ? [...p.showcase, ...p.achievements.filter((id) => !p.showcase.includes(id)).sort((x, y) => (percent[x] ?? 100) - (percent[y] ?? 100))]
                    : p.showcase
                  )
                    .map((id) => ACHIEVEMENT_BY_ID[id])
                    .filter(Boolean)
                    .map((a) => (
                      <button key={a.id} className="pm-ach-item" onClick={() => setInfo(a.id)}>
                        <Medal a={a} />
                        <small>{a.name}</small>
                        {percent[a.id] !== undefined && <small className="muted">{rarityText(percent[a.id])}</small>}
                      </button>
                    ))}
                </div>
              )}
              {p.achievements.length > p.showcase.length && (
                <button className="btn btn-sm btn-ghost pm-more" onClick={() => setAllAch(!allAch)}>
                  {allAch ? t('▲ Згорнути') : t('▼ Показати всі ({0})', p.achievements.length)}
                </button>
              )}
            </div>
            <div className="editor-actions">
              {p.relation === 'none' && (
                <button className="btn btn-primary" onClick={add}>
                  {t('+ Додати в друзі')}
                </button>
              )}
              {p.relation === 'incoming' && (
                <button className="btn btn-primary" onClick={add}>
                  {t('Прийняти заявку')}
                </button>
              )}
              {p.relation === 'outgoing' && <span className="pill">{t('заявку надіслано')}</span>}
              {p.relation === 'friend' && <span className="pill pill-ok">{t('друг')}</span>}
              {p.relation === 'friend' && remove && (
                <button className="btn btn-sm btn-ghost" onClick={remove}>
                  {t('Прибрати з друзів')}
                </button>
              )}
              <button className="btn" onClick={onClose}>
                {t('Закрити')}
              </button>
            </div>
          </>
        )}
      </div>
      {info && <AchievementInfo id={info} percent={percent[info]} onClose={() => setInfo(null)} />}
      {card && (
        <div onClick={(e) => e.stopPropagation()}>
          <CardModal card={getCard(card)} onClose={() => setCard(null)} />
        </div>
      )}
    </div>
  );
}
