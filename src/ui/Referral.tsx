import { useEffect, useState } from 'react';
import type { ReferralView } from '../api/client';
import { FOUNDER_PLATE, REFERRAL_GAMES, REFERRAL_PACK } from '../economy/referrals';
import { t } from '../i18n';
import { packArt } from './cardArt';
import { TitlePlate } from './Achievements';
import { Sheet } from './Sheet';
import { errorText, useSession } from './state';

/** Where the invite code waits between opening the link and signing up. */
export const REF_KEY = 'uc.ref';

/** The invite link of a code: the site's address with #/join/<code>. */
export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}

/** "Запросіть друзів": the invite link, the rewards, and the friends who came through it. */
export function ReferralSheet({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const [r, setR] = useState<ReferralView | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    s.api.referrals().then(setR, (e) => s.toast(errorText(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = r ? inviteUrl(r.code) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard access: the link is on screen to copy by hand.
    }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Ultrachess', text: t('Ultrachess — шахи, де в кожної фігури свій хід. Зареєструйся за моїм посиланням і отримаєш епічний пак.'), url });
      else await copy();
    } catch {
      // Cancelled.
    }
  };

  return (
    <Sheet title={t('Запросіть друзів')} onClose={onClose}>
      <div className="ref">
        <p className="ref-lead">{t('Надішліть другу своє посилання — нагороди отримаєте ви обоє.')}</p>
        <ul className="ref-steps">
          <li>
            <span className="ref-ico">
              <img src={packArt(REFERRAL_PACK)} alt="" />
            </span>
            <span className="ref-txt">
              <b>{t('Друг реєструється')}</b>
              <small>{t('Епічний пак вам і йому.')}</small>
            </span>
          </li>
          <li>
            <span className="ref-ico">
              <img src={packArt(REFERRAL_PACK)} alt="" />
            </span>
            <span className="ref-txt">
              <b>{t('Друг грає {0} партій', REFERRAL_GAMES)}</b>
              <small>{t('Ще по епічному паку.')}</small>
            </span>
          </li>
          <li>
            <span className="ref-ico ref-ico-plate">🌱</span>
            <span className="ref-txt">
              <b>{t('Плашка під ніком')}</b>
              <TitlePlate id={FOUNDER_PLATE} small />
              <small>
                {!r || r.plateOpen
                  ? t('Вам — за друга, який зіграв {0} партій. Видається лише під час акції.', REFERRAL_GAMES)
                  : t('Акцію завершено: плашку більше не видають.')}
              </small>
            </span>
          </li>
        </ul>

        {r ? (
          <>
            <input className="ref-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t('Ваше посилання')} />
            <div className="ref-actions">
              <button className="btn btn-primary" onClick={() => void share()}>
                {t('Поділитися')}
              </button>
              <button className="btn" onClick={() => void copy()}>
                {copied ? t('✓ Скопійовано') : t('Копіювати')}
              </button>
            </div>
            {r.friends.length > 0 && (
              <div className="ref-friends">
                <h3>{t('Запрошені ({0})', r.friends.length)}</h3>
                {r.friends.map((f, i) => (
                  <div key={i} className={`ref-friend ${f.done ? 'done' : ''}`}>
                    <b>{f.name}</b>
                    <span className="bar small-bar">
                      <span style={{ width: `${(f.games / REFERRAL_GAMES) * 100}%` }} />
                    </span>
                    <small>{f.done ? '✓' : `${f.games}/${REFERRAL_GAMES}`}</small>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted">{t('Завантаження…')}</p>
        )}
      </div>
    </Sheet>
  );
}

/** Shown once to every player (per device): the invite campaign. */
export function ReferralPrompt() {
  const s = useSession();
  const key = `uc.ref.prompt.${s.profile.id}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Not over the starter pack (it opens by itself on the first visit).
    if (s.packs.some((p) => p.type === 'starter')) return;
    let seen = true;
    try {
      seen = localStorage.getItem(key) === '1';
    } catch {
      seen = true;
    }
    if (seen) return;
    const timer = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.packs.length]);
  if (!open) return null;
  return (
    <ReferralSheet
      onClose={() => {
        setOpen(false);
        try {
          localStorage.setItem(key, '1');
        } catch {
          // Shown again next time: fine.
        }
      }}
    />
  );
}
