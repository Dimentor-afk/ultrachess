import { type ReactNode, useState } from 'react';
import { Emblem } from './art';
import { pieceSprite } from './cardArt';
import { getSettings } from './settings';
import { errorText, useSession } from './state';
import { getLang, t } from '../i18n';

/** One page of the notes: a picture, a heading, a few plain lines. */
interface Page {
  art: ReactNode;
  title: string;
  text: string;
}

function pages(): Page[] {
  const style = getSettings().blackStyle;
  // With animations off the clip waits for a tap instead of playing by itself.
  const animate = getSettings().animations;
  return [
    {
      // The real thing, recorded from the game (scripts/promo, ad "patchmate"), in the player's language.
      art: (
        <video className="patch-clip" poster="assets/patch/mate.webp" autoPlay={animate} controls={!animate} muted loop playsInline aria-label={t('Анімація мату')}>
          {/* H.264 for most browsers; VP9 where H.264 is missing (Chromium, some Linux Firefox). */}
          <source src={`assets/patch/mate-${getLang()}.mp4`} type="video/mp4" />
          <source src={`assets/patch/mate-${getLang()}.webm`} type="video/webm" />
        </video>
      ),
      title: t('Анімація мату'),
      text: t('Матовий хід тепер іде повільно, король падає, а на дошці з’являється напис «Мат». Підсумок партії відкривається вже після цього.'),
    },
    {
      art: (
        <div className="patch-art patch-nerf">
          <span className="patch-rook">
            <img className="pixel" src={pieceSprite('rook-maneuver', 'rook', 'w', style).src} alt="" />
            <span className="patch-emblem">
              <Emblem cardId="rook-maneuver" />
            </span>
          </span>
          <span className="patch-range">
            <s>4</s> → <b>3</b>
          </span>
        </div>
      ),
      title: t('Маневрова тура'),
      text: t('Дальність ходу зменшено з 4 до 3 клітинок. Ходить і б’є, як і раніше, у всіх 8 напрямках.'),
    },
  ];
}

/** The latest changes, shown once to every player: one change per page, arrows between them. */
export function PatchNotes() {
  const s = useSession();
  const [list] = useState(pages);
  const [at, setAt] = useState(0);
  const [closing, setClosing] = useState(false);
  const close = async () => {
    if (closing) return;
    setClosing(true);
    try {
      s.setProfile(await s.api.seePatch());
    } catch (e) {
      setClosing(false);
      s.toast(errorText(e), 'error');
    }
  };
  const page = list[at];
  const last = at === list.length - 1;
  return (
    <div className="modal-backdrop patch-backdrop">
      <div className="modal patch-notes" role="dialog" aria-modal="true" aria-label={t('Оновлення')}>
        <div className="patch-head">
          <span className="eyebrow">{t('Оновлення')}</span>
          <button className="sheet-close" onClick={() => void close()} aria-label={t('Закрити')}>
            ✕
          </button>
        </div>
        <div className="patch-page" key={at}>
          {page.art}
          <h2>{page.title}</h2>
          <p>{page.text}</p>
        </div>
        <div className="patch-nav">
          <button className="btn patch-arrow" onClick={() => setAt(at - 1)} disabled={at === 0} aria-label={t('Назад')}>
            ←
          </button>
          <span className="patch-dots" aria-label={t('{0} з {1}', at + 1, list.length)}>
            {list.map((_, i) => (
              <i key={i} className={i === at ? 'on' : ''} />
            ))}
          </span>
          {last ? (
            <button className="btn btn-primary" onClick={() => void close()} disabled={closing}>
              {t('Зрозуміло')}
            </button>
          ) : (
            <button className="btn btn-primary patch-arrow" onClick={() => setAt(at + 1)} aria-label={t('Далі')}>
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
