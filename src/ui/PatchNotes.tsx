import { type ReactNode, useState } from 'react';
import { SKIN_BY_ID } from '../economy/skins';
import { SEASON } from '../economy/weekly';
import { pieceSprite } from './cardArt';
import { getSettings } from './settings';
import { errorText, useSession } from './state';
import { DivisionBadge } from './WeeklyPage';
import { seasonStart, weekScheduleLine } from './weeklyTime';
import { t, tr } from '../i18n';

/** One page of the notes: a picture, a heading, a few plain lines. */
interface Page {
  art: ReactNode;
  title: string;
  text: string;
}

function pages(): Page[] {
  const style = getSettings().blackStyle;
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
      text: t('У лізі ботів сила бота тепер залежить від ваших кубків: при 460 🏆 ви граєте з ботом приблизно на 460 Elo. Що більше кубків, то сильніший суперник. Арени тепер тягнуться до 3000 🏆.'),
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
      text: t('Перемагайте в лізі ботів кілька разів поспіль: третя перемога підряд дає +30 🏆, а кожна наступна +40 🏆. Поразка чи нічия обнуляє серію. Лічильник серії видно під кнопкою «Бій».'),
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
      text: t('Новий рейтинговий режим, що проходить щотижня з {0}. Грати можна від 500 🏆 у лізі ботів. На вас чекає 15 матчів, кожен з новим ботом, а нагороди дають за 3, 6, 9, 12 і 15 перемог. Увійти можна кнопкою поруч із «Бій». Такий самий тиждень з гравцями з’явиться згодом.', weekScheduleLine()),
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
      text: t('Перший сезон стартує {0}, а його кінець поки під знаком «?». За 12 перемог у Тижні слави ви отримаєте скін Берсерка, і що вищий дивізіон, то кращий скін. За 15 перемог до нього додається плашка «Лють Берсерка». Скін вдягається у вікні картки в колоді, і його бачать обидва гравці. Скіни в нагородах можна роздивитись ближче, якщо торкнутися їх.', seasonStart()),
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
      text: t('У Друзях з’явилась кнопка «Драфт»: колоди для гри з другом ви збираєте просто перед партією. За п’ять раундів кожен із двох карток одну бере собі, а другу віддає суперникові. Міфологічних карт і нагород тут немає, це гра для розваги.'),
    },
    {
      art: (
        <div className="patch-art patch-quake" aria-hidden="true">
          <img className="pixel" src={sprite('rook-earthquake', 'rook')} alt="" />
          <span className="patch-quake-line">
            <i>→</i>
            <i />
            <i>
              <img className="pixel" src={sprite('pawn-classic', 'pawn')} alt="" />
            </i>
            <i className="edge">
              <img className="pixel" src={sprite('knight-classic', 'knight')} alt="" />
            </i>
          </span>
        </div>
      ),
      title: tr('Землетрус'),
      text: t('Фігури більше не перелітають на протилежний край дошки. Лінія, як і раніше, зсувається на 1 клітинку, але фігура біля краю лишається на місці разом з тими, що впираються в неї.'),
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
