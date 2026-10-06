import { useEffect, useState } from 'react';
import type { ReferralView } from '../api/client';
import { REFERRAL_GAMES } from '../economy/referrals';
import { FOUNDER_PLATE } from '../economy/referrals';
import { t } from '../i18n';
import { packArt } from './cardArt';
import { TitlePlate } from './Achievements';
import { Sheet } from './Sheet';
import { locale } from '../i18n';
import { errorText, useSession } from './state';

/** Where the invite code waits between opening the link and signing up. */
export const REF_KEY = 'uc.ref';

/** The invite link of a code: the site's address with #/join/<code>. */
export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}

/** "Поділіться грою": the invite link, the rewards, and the friends who came through it. */
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
      if (navigator.share) await navigator.share({ title: 'Ultrachess', text: t('Шахи, де кожна фігура — унікальна. Заходь за моїм посиланням — отримаєш епічний пак!'), url });
      else await copy();
    } catch {
      // Cancelled.
    }
  };

  return (
    <Sheet title={t('Поділіться грою')} onClose={onClose}>
      <div className="ref">
        <p className="ref-lead">{t('Допоможіть розвивати Ultrachess і зібрати спільноту: запросіть друзів за своїм посиланням.')}</p>
        <ol className="ref-steps">
          <li>
            <img src={packArt('epic')} alt="" />
            <span>
              <b>{t('Друг зареєструвався за посиланням')}</b>
              <small>{t('Епічний пак вам і епічний пак другу.')}</small>
            </span>
          </li>
          <li>
            <img src={packArt('epic')} alt="" />
            <span>
              <b>{t('Друг зіграв {0} партій', REFERRAL_GAMES)}</b>
              <small>{t('Ще по епічному паку вам обом.')}</small>
            </span>
          </li>
          <li className="ref-plate-step">
            <TitlePlate id={FOUNDER_PLATE} />
            <span>
              <b>{t('Ексклюзивна плашка')}</b>
              <small>
                {r && r.plateOpen
                  ? t('Лише для тих, хто запросить друга до {0}. Потім її не отримати.', new Date(r.plateUntil).toLocaleDateString(locale()))
                  : t('Цю плашку більше не видають.')}
              </small>
            </span>
          </li>
        </ol>

        {r ? (
          <>
            <div className="ref-link">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t('Ваше посилання')} />
            </div>
            <div className="ref-actions">
              <button className="btn btn-primary" onClick={() => void share()}>
                {t('📤 Поділитися')}
              </button>
              <button className="btn" onClick={() => void copy()}>
                {copied ? t('✓ Скопійовано') : t('Копіювати')}
              </button>
            </div>
            {r.friends.length > 0 && (
              <div className="ref-friends">
                <h3>{t('Ваші запрошені ({0})', r.friends.length)}</h3>
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
