import { type ReactNode, useState } from 'react';
import { SKIN_BY_ID } from '../economy/skins';
import { SEASON } from '../economy/weekly';
import { pieceSprite } from './cardArt';
import { getSettings } from './settings';
import { errorText, useSession } from './state';
import { DivisionBadge } from './WeeklyPage';
import { seasonStart, weekScheduleLine } from './weeklyTime';
import { t } from '../i18n';

/** One page of the notes: a picture, a heading, a few plain lines. */
interface Page {
  art: ReactNode;
  title: string;
  text: string;
}

function pages(): Page[] {
  const style = getSettings().blackStyle;
  const schedule = weekScheduleLine();
  const sprite = (id: string, type: string) => pieceSprite(id, type, 'w', style).src;
  return [
    {
      art: (
        <div className="patch-art patch-elo">
          <span className="patch-elo-side">
            <b>460</b>
            <small>🏆 {t('кубків')}</small>
          </span>
          <span className="patch-elo-eq">≈</span>
          <span className="patch-elo-side bot">
            <b>460</b>
            <small>🤖 Elo</small>
          </span>
        </div>
      ),
      title: t('Бот за кубками'),
      text: t('Сила бота тепер залежить від ваших кубків: 460 🏆 означає бота приблизно на 460 Elo. Арени розтягнуто до 3000, тож верхні справді найсильніші.'),
    },
    {
      art: (
        <div className="patch-art patch-streak" aria-hidden="true">
          <i>🔥</i>
          <i>🔥</i>
          <i className="b">+30</i>
          <i className="b top">+40</i>
        </div>
      ),
      title: t('Серія перемог'),
      text: t('Виграйте двічі поспіль у лізі ботів, і третя перемога дасть +30 🏆, а далі по +40. Поразка чи нічия обнуляє серію. Лічильник під кнопкою «Бій».'),
    },
    {
      art: (
        <div className="patch-art patch-weekly" aria-hidden="true">
          {[5, 4, 3, 2, 1].map((n) => (
            <DivisionBadge key={n} n={n} size={n === 1 ? 'lg' : 'md'} />
          ))}
        </div>
      ),
      title: t('Тиждень слави'),
      text: t('Новий рейтинговий режим щотижня: {0}. Від 500 кубків: 5 дивізіонів, 15 матчів, кожен з новим ботом, нагороди за 3, 6, 9, 12 і 15 перемог. Такий самий тиждень з гравцями скоро. Кнопка поруч із «Бій» на головній.', schedule),
    },
    {
      art: (
        <div className="patch-art patch-skins" aria-hidden="true">
          {SEASON.skins.map((id) => (
            <img key={id} src={SKIN_BY_ID[id].art} alt="" />
          ))}
        </div>
      ),
      title: t('Сезон Берсерка'),
      text: t('Старт {0}, кінець поки «?». За 12 перемог у Тижні слави дають скіни Берсерка, за 15 ще й плашку «Лють Берсерка». Що вищий дивізіон, то кращі скіни. Торкніться скіна в нагородах, щоб роздивитись. Скін вдягається у вікні картки в колоді, його бачать обидва гравці.', seasonStart()),
    },
    {
      art: (
        <div className="patch-art patch-draft" aria-hidden="true">
          <span className="patch-draft-card">
            <img className="pixel" src={sprite('knight-rider', 'knight')} alt="" />
          </span>
          <b>{t('або')}</b>
          <span className="patch-draft-card">
            <img className="pixel" src={sprite('knight-wallrunner', 'knight')} alt="" />
          </span>
        </div>
      ),
      title: t('Драфт з друзями'),
      text: t('У Друзях з’явилась кнопка «Драфт». П’ять раундів: з двох карток одну берете собі, другу отримує суперник. Без міфологічних карт і без нагород, просто для розваги.'),
    },
  ];
}

/**
 * The latest changes, shown once to every player: one change per page, arrows between them.
 * With `onClose` it is opened again from the settings and only closes.
 */
export function PatchNotes({ onClose }: { onClose?: () => void }) {
  const s = useSession();
  const [list] = useState(pages);
  const [at, setAt] = useState(0);
  const [closing, setClosing] = useState(false);
  const close = async () => {
    if (onClose) return onClose();
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
