import { useEffect, useState } from 'react';
import type { PublicProfile } from '../api/client';
import { CARDS } from '../engine/cards';
import { Avatar } from './common';
import { errorText, useSession } from './state';

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
      s.toast(p?.relation === 'incoming' ? 'Тепер ви друзі!' : 'Заявку надіслано.');
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
      <div className="modal player-modal" role="dialog" aria-label="Профіль гравця" onClick={(e) => e.stopPropagation()}>
        {!p ? (
          <p className="muted">Завантаження…</p>
        ) : (
          <>
            <div className="player-modal-head">
              <span className="avatar-wrap">
                <Avatar card={p.avatar} size="lg" />
                <span className={`presence ${p.online ? 'on' : ''}`} />
              </span>
              <div>
                <h2>{p.name}</h2>
                <span className="tag-chip">#{p.tag}</span>
              </div>
            </div>
            <div className="stat-grid compact">
              <div className="stat">
                <b>🏆 {p.trophies}</b>
                <span>{p.arena}</span>
              </div>
              <div className="stat">
                <b>{p.bestTrophies}</b>
                <span>рекорд</span>
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
                <span>карток</span>
              </div>
            </div>
            <div className="editor-actions">
              {p.relation === 'none' && (
                <button className="btn btn-primary" onClick={add}>
                  + Додати в друзі
                </button>
              )}
              {p.relation === 'incoming' && (
                <button className="btn btn-primary" onClick={add}>
                  Прийняти заявку
                </button>
              )}
              {p.relation === 'outgoing' && <span className="pill">заявку надіслано</span>}
              {p.relation === 'friend' && <span className="pill pill-ok">друг</span>}
              {p.relation === 'friend' && remove && (
                <button className="btn btn-sm btn-ghost" onClick={remove}>
                  Прибрати з друзів
                </button>
              )}
              <button className="btn" onClick={onClose}>
                Закрити
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
