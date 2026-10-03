import { PACK_SHARD_PRICE, SHARDS_PER_DUPE } from '../economy/packs';
import { LADDER_PACK_LIMIT, LADDER_TROPHIES, LADDER_WIN_GOLD } from '../economy/leagues';
import { EFFECT_NAMES, RARITY_NAMES } from '../engine/cards';
import type { EffectType, Rarity } from '../engine/types';
import { cardArt } from './cardArt';

const EFFECT_HELP: Record<EffectType, string> = {
  permanent: 'Працює завжди — просто інший хід фігури.',
  once: 'Можна використати один раз за партію; значок гасне після використання.',
  button: 'Натискаєте кнопку здібності в бічній панелі. Кнопки не витрачають хід.',
  auto: 'Спрацьовує сама, коли виконано умову (наприклад, фігуру б’ють).',
  cooldown: 'Після використання перезаряджається кілька ваших ходів — лічильник ⏳ видно на фігурі.',
};

/** A short guide to the game for new players. */
export function HelpPage() {
  return (
    <section className="page help">
      <div className="page-head">
        <h1>Як грати</h1>
        <p className="muted">Шахи, де кожна фігура — картка зі своїм ходом. Усе, що треба знати, на одній сторінці.</p>
      </div>

      <div className="help-grid">
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('knight-classic')!} alt="" />
          <h2>1. Звичайні шахи — основа</h2>
          <p>
            Дошка 8×8, ті самі фігури й мета: поставити мат королю суперника. Шах, пат, рокіровка й перетворення пішака працюють як у класиці,
            якщо картка не каже інакше.
          </p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('queen-amazon')!} alt="" />
          <h2>2. Кожна фігура — картка</h2>
          <p>
            У колоді 16 фігур. На кожну позицію ставите картку потрібної фігури: Амазонка — це ферзь, Штурмовик — пішак. Пішаки можуть мати до
            2 різних версій, а міфологічна картка в колоді — лише одна.
          </p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('knight-mirage')!} alt="" />
          <h2>3. Здібності</h2>
          <ul className="help-list">
            {(Object.keys(EFFECT_HELP) as EffectType[]).map((e) => (
              <li key={e}>
                <b>{EFFECT_NAMES[e]}.</b> {EFFECT_HELP[e]}
              </li>
            ))}
          </ul>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('rook-illusionist')!} alt="" />
          <h2>4. Приховане</h2>
          <p>
            Ілюзіоністи й Міраж лишають копії, які суперник бачить як справжні фігури. Свої ілюзії ви бачите напівпрозорими. Підказку й
            захист Безсмертної бачите лише ви.
          </p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('knight-berserk')!} alt="" />
          <h2>5. Вибір на дошці</h2>
          <p>
            Якщо хід має варіанти (Берсерк б’є далі, Дуеліст повертається), фігура стає на клітинку, а інші варіанти підсвічуються. Натисніть
            фігуру, щоб лишити її, або підсвічену клітинку.
          </p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src="assets/packs/epic.png" alt="" />
          <h2>6. Паки, уламки, золото</h2>
          <p>
            Дві ліги з окремими кубками. Ліга ботів: +{LADDER_TROPHIES.bot.win} кубків, 🪙 {LADDER_WIN_GOLD.bot} і пак (до{' '}
            {LADDER_PACK_LIMIT.bot} на день). Ліга гравців: +{LADDER_TROPHIES.pvp.win}, 🪙 {LADDER_WIN_GOLD.pvp} і пак (до{' '}
            {LADDER_PACK_LIMIT.pvp} на день). За перший вихід у нову лігу — бонус. Повторка картки стає уламками 💎 (
            {(Object.entries(SHARDS_PER_DUPE) as [Rarity, number][]).map(([r, n]) => `${RARITY_NAMES[r].toLowerCase()} ${n}`).join(', ')}
            ), за них у магазині купуються паки (від 💎 {PACK_SHARD_PRICE.common}). Золото купує кольори дошки.
          </p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('king-hint')!} alt="" />
          <h2>7. Щоденні завдання</h2>
          <p>Щодня три завдання: зіграти партії, перемогти, відкрити паки чи зіграти з другом. Нагороду забираєте на головній.</p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('knight-brother')!} alt="" />
          <h2>8. Друзі</h2>
          <p>
            Знайдіть друга за нікнеймом або кодом #ABC123, додайте й викличте на гру. Ходити можна в будь-який час — як у листуванні. Дружні
            партії не змінюють кубків.
          </p>
        </article>
        <article className="panel help-card">
          <img className="pixel help-art" src={cardArt('king-comet')!} alt="" />
          <h2>9. Випробування</h2>
          <p>
            Серії перемог поспіль за уламки: проти ботів або в лізі гравців. Одна поразка чи нічия — і спробу завершено. Найважче, «Шлях
            Комети», дає Комету: короля з ривком до 5 клітинок, якого немає в жодному паку.
          </p>
        </article>
      </div>
    </section>
  );
}
