import { t } from '../i18n';
// Scripts of the card clips: a few pieces and the steps that show the card's
// trick. Pieces: "hero" (the card itself, white), "w:pawn" / "b:knight"
// (classic pieces), "b:rook-kamikaze" (a card), "!" = has already moved,
// "^d1" = home square. Missing kings are added on h1 / a8 (or `kings`).
// Moves: "e2 e4" (from, target), "hero *" (the hero's best move matching
// `label`). A side that is not to move gets the turn as if the other side
// had made a quiet move. `then` captions the result of the step.

export type ClipStep =
  | { move: string; say: string; then?: string; label?: RegExp }
  | { marks: string; say: string }
  | { ability: string; key: RegExp; say: string; then?: string; show?: string }
  | { choose: string; say: string; then?: string };

export interface ClipScript {
  pieces: Record<string, string>;
  steps: ClipStep[];
  kings?: { w?: string; b?: string };
  ring?: boolean;
}

const ROW2 = {
  a2: 'w:pawn',
  b2: 'w:pawn',
  c2: 'w:pawn',
  d2: 'w:pawn',
  e2: 'w:pawn',
  f2: 'w:pawn',
  g2: 'w:pawn',
};

export const CARD_SCRIPTS: Record<string, ClipScript> = {
  // ── Пішаки ──
  'pawn-classic': {
    pieces: { e2: 'hero', d5: 'b:pawn' },
    steps: [
      { move: 'e2 e4', say: t('Першим ходом — на 2 клітинки вперед') },
      { move: 'e4 d5', say: t('Б\'є по діагоналі вперед') },
    ],
  },
  'pawn-stormer': {
    pieces: { e3: 'hero!', e4: 'b:knight', d4: 'b:pawn', f4: 'b:bishop' },
    steps: [
      { marks: 'e3', say: t('По діагоналі не б\'є — тільки прямо вперед') },
      { move: 'e3 e4', say: t('Б\'є фігуру прямо перед собою') },
    ],
  },
  'pawn-retreater': {
    pieces: { e4: 'hero!', d6: 'b:pawn' },
    steps: [
      { move: 'd6 d5', say: t('Ворожий пішак загрожує…') },
      {
        move: 'e4 e3',
        label: /Відступ/,
        say: t('…а Відступник крокує на 1 назад'),
      },
    ],
  },
  'pawn-oblique': {
    pieces: { e2: 'hero', e3: 'b:knight' },
    steps: [
      {
        move: 'e2 f3',
        label: /Косий/,
        say: t('Раз за гру — крок по діагоналі на вільну клітинку'),
        then: t('❄ Після цього пропускає наступний хід'),
      },
    ],
  },
  'pawn-ram': {
    pieces: { e4: 'hero!', e5: 'b:pawn' },
    steps: [
      {
        move: 'e4 e5',
        label: /Таран/,
        say: t('Раз за гру штовхає ворожого пішака назад'),
        then: t('…і займає його клітинку'),
      },
    ],
  },
  'pawn-diagonal': {
    pieces: { e2: 'hero', e3: 'b:knight', d4: 'b:pawn' },
    steps: [
      { move: 'e2 d3', say: t('Ходить по діагоналі вперед') },
      { move: 'd3 d4', say: t('А б\'є — прямо вперед') },
    ],
  },
  'pawn-sprinter': {
    pieces: { e4: 'hero!', d7: 'b:pawn' },
    steps: [
      { marks: 'e4', say: t('Уже ходив, а ривок на 2 є (фіолетове)') },
      {
        move: 'e4 e6',
        label: /Спринт/,
        say: t('Раз за гру — ривок на 2 з будь-якої клітинки'),
        then: t('Ривок витрачено — далі звичайний пішак'),
      },
    ],
  },
  'pawn-stubborn': {
    pieces: { e4: 'hero!', e5: 'b:knight' },
    steps: [
      {
        move: 'e4 e5',
        label: /Помінятися/,
        say: t('Раз за гру міняється місцями з ворогом попереду'),
        then: t('❄ Після обміну пропускає хід'),
      },
    ],
  },
  'pawn-marathoner': {
    pieces: { e2: 'hero', d7: 'b:pawn' },
    steps: [
      { marks: 'e2', say: t('Першим ходом — аж до 3 клітинок') },
      {
        move: 'e2 e5',
        label: /Марафон/,
        say: t('Першим ходом — одразу 3 клітинки вперед'),
      },
    ],
  },
  'pawn-phantom': {
    pieces: { e4: 'hero!', e5: 'b:pawn' },
    steps: [
      {
        move: 'e4 e6',
        label: /Фантом/,
        say: t('Раз за гру проходить крізь фігуру попереду'),
        then: t('Після стрибка вже не перетвориться на 8-му ряду'),
      },
    ],
  },
  'pawn-spearman': {
    pieces: { e3: 'hero!', e5: 'b:knight' },
    steps: [
      {
        move: 'e3 e5',
        label: /списом/,
        say: t('Списом б\'є через клітинку'),
        then: t('…і сам робить крок уперед'),
      },
    ],
  },
  'pawn-ambusher': {
    pieces: { e4: 'hero!', b6: 'b:knight' },
    steps: [
      {
        move: 'b6 d5',
        say: t('Ворожий кінь стає по діагоналі перед Засідником…'),
        then: t('…Засідник забирає його, але гине сам'),
      },
    ],
  },
  'pawn-shieldbearer': {
    pieces: { e4: 'hero!', d5: 'b:pawn' },
    steps: [
      {
        move: 'd5 e4',
        say: t('Ворожий пішак б\'є Щитоносця…'),
        then: t('🛡 …а той вистояв і відступив на 1 назад'),
      },
    ],
  },
  'pawn-duelist': {
    pieces: { e4: 'hero!', d5: 'b:knight' },
    steps: [
      {
        move: 'e4 d5',
        label: /повернутись/,
        say: t('Б\'є — і одразу повертається на свою клітинку'),
        then: t('❄ Повернувся — пропускає наступний хід'),
      },
    ],
  },

  // ── Слони ──
  'bishop-classic': {
    pieces: { c1: 'hero', g5: 'b:knight' },
    steps: [{ move: 'c1 g5', say: t('Ходить і б\'є по діагоналі на будь-яку відстань') }],
  },
  'bishop-sentinel': {
    pieces: { d4: 'hero!', d6: 'b:knight', g7: 'b:pawn' },
    steps: [
      { marks: 'd4', say: t('Ходить як ферзь, але лише на 1–2 клітинки') },
      { move: 'd4 d6', say: t('Тож б\'є навіть по прямій') },
    ],
  },
  'bishop-sniper': {
    pieces: { d4: 'hero!', e5: 'b:pawn', b6: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Впритул не б\'є — ціль має бути за 2+ клітинки') },
      {
        move: 'd4 b6',
        label: /пройти/,
        say: t('Здалеку б\'є…'),
        then: t('…і проходить ще 1 клітинку далі'),
      },
    ],
  },
  'bishop-paratrooper': {
    pieces: { c1: 'hero', ...ROW2 },
    steps: [
      { marks: 'c1', say: t('Свої пішаки закрили дорогу, але…') },
      {
        move: 'c1 e3',
        label: /Десант/,
        say: t('…першим ходом слон перестрибує свого пішака'),
        then: t('❄ Після десанту пропускає хід. Далі — як звичайний слон'),
      },
    ],
  },
  'bishop-jumper': {
    pieces: { c1: 'hero', d2: 'w:pawn', e5: 'b:pawn!' },
    steps: [
      { marks: 'c1', say: t('Пішак упритул: без розгону стрибнути не можна') },
      { move: 'c1 b2', say: t('Тож іде звичайно') },
      { move: 'a8 b8', say: t('Суперник ходить…') },
      { marks: 'hero', say: t('Перед пішаком e5 дві вільні клітинки — є розгін (фіолетове)') },
      { move: 'b2 f6', label: /Перестрибнути/, say: t('Перестрибнув і став одразу за ним'), then: t('Через свої пішаки на старті так не вийде — це трюк Десантника') },
    ],
  },
  'bishop-martyr': {
    pieces: { d4: 'hero!', d8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd8 d4',
        say: t('Ворожа тура б\'є Мученика…'),
        then: t('❄ …і завмирає на 2 свої ходи'),
      },
    ],
  },
  'bishop-ricochet': {
    pieces: { e3: 'hero!', b8: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e3', say: t('Фіолетові клітинки — кінці рикошетів від краю') },
      {
        move: 'e3 b8',
        label: /Рикошет/,
        say: t('Дійшов до краю — і рикошетом на нову діагональ'),
        then: t('Звичайний слон сюди б не дістав'),
      },
    ],
  },
  'bishop-illusionist': {
    pieces: { d4: 'hero!', a7: 'b:bishop' },
    kings: { b: 'b8' },
    steps: [
      { move: 'd4 f6', say: t('Іде, а на старій клітинці лишає невидиму копію') },
      {
        move: 'a7 d4',
        say: t('Суперник бачить дві фігури й б\'є не ту…'),
        then: t('…ілюзія розвіялась, хід суперника згорів'),
      },
    ],
  },
  'bishop-piercer': {
    pieces: { c3: 'hero!', d4: 'b:pawn', e5: 'b:queen' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'c3 e5',
        label: /Прокол/,
        say: t('Б\'є ворога крізь іншу фігуру…'),
        then: t('…але й сам гине'),
      },
    ],
  },
  'bishop-chain': {
    pieces: { c1: 'hero!', d6: 'b:knight' },
    steps: [
      { marks: 'c1', say: t('Фіолетові — клітинки, куди веде хід із поворотом') },
      {
        move: 'c1 d6',
        label: /поворот/,
        say: t('До 3 клітинок, поворот — і ще до 2'),
      },
    ],
  },
  'bishop-chameleon': {
    pieces: { d4: 'hero!', g8: 'b:rook' },
    steps: [
      {
        move: 'd4 d5',
        label: /колір/,
        say: t('Замість ходу — крок на клітинку іншого кольору'),
      },
      { move: 'd5 g8', say: t('Тепер полює на світлих клітинках') },
    ],
  },
  'bishop-flanker': {
    pieces: { a3: 'hero!', a5: 'b:knight' },
    steps: [
      { marks: 'a3', say: t('На краю — стрибок через клітинку (фіолетові)') },
      {
        move: 'a3 a5',
        label: /краю/,
        say: t('На краю стрибає вздовж краю на свій колір'),
      },
    ],
  },
  'bishop-levitation': {
    pieces: { d4: 'hero!', a3: 'b:rook' },
    kings: { b: 'a8' },
    ring: true,
    steps: [
      {
        move: 'd4 ←↓',
        label: /Левітація/,
        say: t('Виходить за край дошки — на платформу'),
        then: t('Платформа тримає 3 ходи суперника'),
      },
      { move: 'a3 c3', say: t('Суперник ходить…') },
      { move: 'hero c3', say: t('Слон повертається з платформи й б\'є') },
    ],
  },
  'bishop-portal': {
    pieces: { e3: 'hero!', b4: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e3', say: t('Фіолетові клітинки — куди слон дістає через портал') },
      { move: 'e3 b4', label: /портал/i, say: t('За край — і з дзеркального боку, з\'їдає коня') },
      { move: 'h8 g8', say: t('Суперник ходить…') },
      { marks: 'hero', say: t('Після порталу слон перезаряджається 5 ваших ходів') },
    ],
  },
  'bishop-eclipse': {
    pieces: { d4: 'hero!', h3: 'b:queen' },
    kings: { w: 'b1', b: 'a8' },
    steps: [
      {
        ability: 'd4',
        key: /diag:1:/,
        say: t('Кнопка: бар\'єр на діагональ слона'),
      },
      { move: 'b1 c2', say: t('Хід не витрачено — тепер звичайний хід') },
      { marks: 'h3', say: t('Наступним ходом ферзь не може перетнути бар’єр') },
    ],
  },

  // ── Тури ──
  'rook-classic': {
    pieces: { d1: 'hero', d7: 'b:pawn' },
    steps: [{ move: 'd1 d7', say: t('Ходить і б\'є по прямій на будь-яку відстань') }],
  },
  'rook-sniper': {
    pieces: { d4: 'hero!', d5: 'b:pawn', g4: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Впритул не б\'є — ціль має бути за 2+ клітинки') },
      {
        move: 'd4 g4',
        label: /пройти/,
        say: t('Здалеку б\'є…'),
        then: t('…і проходить ще 1 клітинку далі'),
      },
    ],
  },
  'rook-paratrooper': {
    pieces: { a1: 'hero', ...ROW2, b1: 'w:knight' },
    steps: [
      { marks: 'a1', say: t('Свої фігури закрили дорогу, але…') },
      {
        move: 'a1 a3',
        label: /Десант/,
        say: t('…першим ходом тура перестрибує свого пішака'),
        then: t('❄ Після десанту пропускає хід. Далі — як звичайна тура'),
      },
    ],
  },
  'rook-maneuver': {
    pieces: { d4: 'hero!', g7: 'b:knight', d8: 'b:pawn' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Ходить ще й по діагоналі, але не далі 4 клітинок') },
      { move: 'd4 g7', say: t('Б\'є по діагоналі') },
    ],
  },
  'rook-jumper': {
    pieces: { d1: 'hero', d2: 'w:pawn', d6: 'b:knight' },
    steps: [
      { marks: 'd1', say: t('Пішак упритул: без розгону стрибнути не можна') },
      { move: 'd2 d3', say: t('Пішак пішов уперед…') },
      { move: 'a8 b8', say: t('Суперник ходить…') },
      { marks: 'hero', say: t('Тепер перед пішаком є вільна клітинка — розгін (фіолетове)') },
      { move: 'd1 d4', label: /Перестрибнути/, say: t('Перестрибнула й стала одразу за ним'), then: t('Через свої пішаки на старті так не вийде — це трюк Десантної тури') },
    ],
  },
  'rook-ricochet': {
    pieces: { d4: 'hero!', e8: 'b:knight' },
    steps: [
      { marks: 'd4', say: t('Фіолетові клітинки — кінці рикошетів від краю') },
      {
        move: 'd4 e8',
        label: /Рикошет/,
        say: t('Дійшла до краю — і рикошетом на 1 убік'),
        then: t('Звичайна тура сюди б не дістала'),
      },
    ],
  },
  'rook-illusionist': {
    pieces: { d4: 'hero!', a7: 'b:bishop' },
    kings: { b: 'h8' },
    steps: [
      { move: 'd4 d6', say: t('Іде, а на старій клітинці лишає невидиму копію') },
      {
        move: 'a7 d4',
        say: t('Суперник бачить дві тури й б\'є не ту…'),
        then: t('…ілюзія розвіялась, хід суперника згорів'),
      },
    ],
  },
  'rook-tunnel': {
    pieces: { d1: 'hero!', c1: 'w:bishop', d2: 'w:pawn', e1: 'w:knight', c2: 'b:pawn' },
    steps: [
      { marks: 'd1', say: t('Тура замкнена своїми фігурами — звичайна тут не зрушила б') },
      {
        move: 'd1 e2',
        label: /Тихий крок/,
        say: t('Тихий крок: 1 клітинка по діагоналі на вільну'),
        then: t('По діагоналі не б\'є: пішака на c2 так не взяти'),
      },
    ],
  },
  'rook-corner': {
    pieces: { d1: 'hero!', f3: 'b:knight' },
    steps: [
      { marks: 'd1', say: t('Фіолетові — клітинки, куди веде хід із поворотом') },
      {
        move: 'd1 f3',
        label: /поворот/,
        say: t('До 3 клітинок, поворот на 90° — і ще до 2'),
        then: t('Звичайна тура так не вміє'),
      },
    ],
  },
  'rook-battering': {
    pieces: { d1: 'hero!', d4: 'b:pawn', d6: 'b:queen' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd1 d6',
        label: /Таран/,
        say: t('Раз за гру проходить крізь ворога…'),
        then: t('…і б\'є того, хто стоїть за ним'),
      },
    ],
  },
  'rook-displacer': {
    pieces: { d1: 'hero!', d3: 'w:knight' },
    steps: [
      {
        move: 'd1 d3',
        label: /Витіснити/,
        say: t('Стає на клітинку своєї фігури'),
        then: t('…а ту відштовхує на 1 далі'),
      },
    ],
  },
  'rook-kamikaze': {
    pieces: { d4: 'hero!', f5: 'b:knight' },
    steps: [
      {
        move: 'f5 d4',
        say: t('Ворожий кінь б\'є Смертника…'),
        then: t('💥 …і гине разом із ним'),
      },
    ],
  },
  'rook-castle': {
    pieces: { a5: 'hero!', e1: 'w:king!', h4: 'b:queen' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'a5 f2',
        label: /Телепорт/,
        say: t('Шах! Раз за гру тура телепортується до короля'),
        then: t('…і закриває його від ферзя'),
      },
    ],
  },
  'rook-fortress': {
    pieces: { d4: 'hero!', f5: 'b:knight' },
    steps: [
      {
        move: 'f5 d4',
        say: t('Ворожий кінь б\'є Фортечну туру…'),
        then: t('🛡 …вона вистояла й відійшла (❄ пропускає хід)'),
      },
    ],
  },
  'rook-earthquake': {
    pieces: { d1: 'hero!', b6: 'b:bishop', e6: 'b:knight', h6: 'b:pawn' },
    kings: { w: 'a1' },
    steps: [
      {
        ability: 'd1',
        key: /^rank:5:1$/,
        say: t('Кнопка: обираєте лінію без королів…'),
        then: t('…і всі фігури на ній зсуваються на 1'),
      },
      { move: 'd1 d4', say: t('Хід не витрачено — тура ще й ходить') },
    ],
  },

  // ── Коні ──
  'knight-classic': {
    pieces: {
      d4: 'hero!',
      c5: 'w:pawn',
      d5: 'w:pawn',
      e5: 'w:pawn',
      e6: 'b:rook',
    },
    steps: [{ move: 'd4 e6', say: t('Стрибає буквою «Г» — прямо через фігури') }],
  },
  'knight-camel': {
    pieces: { d4: 'hero!', e7: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Стрибає 3+1 замість 2+1') },
      { move: 'd4 e7', say: t('Дістає далі за звичайного коня') },
    ],
  },
  'knight-herald': {
    pieces: { d2: 'hero', d3: 'w:pawn', d4: 'b:knight' },
    steps: [
      { marks: 'd2', say: t('Свій пішак попереду — а Гінцю байдуже') },
      {
        move: 'd2 d4',
        label: /2/,
        say: t('Лише першим ходом — стрибок на 2 прямо вперед'),
      },
    ],
  },
  'knight-diagonal': {
    pieces: { d2: 'hero', e3: 'w:pawn', f4: 'b:knight' },
    steps: [
      {
        marks: 'd2',
        say: t('Фіолетове — стрибок, якого немає у звичайного коня'),
      },
      {
        move: 'd2 f4',
        label: /діагонал/,
        say: t('Лише першим ходом — стрибок на 2 по діагоналі'),
      },
    ],
  },
  'knight-illusionist': {
    pieces: { d4: 'hero!', a7: 'b:bishop' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd4 f5',
        say: t('Стрибає, а на старій клітинці лишає невидиму копію'),
      },
      {
        move: 'a7 d4',
        say: t('Суперник бачить двох коней і б\'є не того…'),
        then: t('…ілюзія розвіялась, хід суперника згорів'),
      },
    ],
  },
  'knight-squire': {
    pieces: { d4: 'hero!', c5: 'b:pawn', e5: 'b:pawn' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Крім стрибків — ще й 1 крок по прямій') },
      { move: 'd4 d5', say: t('Тихий крок уперед (без взяття)') },
    ],
  },
  'knight-central': {
    pieces: { d4: 'hero!', e7: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('У центрі дошки (c3–f6) — ще й далекі стрибки 3+1') },
      { move: 'd4 e7', say: t('Далекий стрибок зі взяттям') },
    ],
  },
  'knight-brother': {
    pieces: { d4: 'hero!', e4: 'w:knight', e7: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Поруч свій кінь — з\'являються стрибки 3+1') },
      { move: 'd4 e7', say: t('Далекий стрибок зі взяттям') },
    ],
  },
  'knight-wallrunner': {
    pieces: { f3: 'hero!' },
    steps: [
      { marks: 'f3', say: t('Фіолетові — пробіжка вздовж краю після стрибка') },
      {
        move: 'f3 h6',
        label: /краю/,
        say: t('Приземлився на краю — і біжить уздовж нього'),
      },
    ],
  },
  'knight-galloper': {
    pieces: { b1: 'hero', e4: 'b:rook' },
    steps: [
      { marks: 'b1', say: t('Першим ходом — два стрибки поспіль (фіолетові)') },
      { move: 'b1 e4', say: t('Першим ходом — два стрибки поспіль') },
    ],
  },
  'knight-springboard': {
    pieces: { e2: 'hero!', f1: 'w:bishop', b5: 'b:rook' },
    steps: [{ move: 'f1 b5', say: t('Свій слон проходить крізь Трамплін') }],
  },
  'knight-rotator': {
    pieces: { d4: 'hero!', d5: 'w:pawn!', d6: 'b:pawn' },
    steps: [
      { marks: 'd4', say: t('Фіолетове — обмін зі своїм пішаком') },
      {
        move: 'd4 d5',
        label: /Помінятися/,
        say: t('Замість стрибка міняється місцями зі своїм пішаком'),
      },
    ],
  },
  'knight-berserk': {
    pieces: { d4: 'hero!', e6: 'b:pawn', g7: 'b:rook' },
    kings: { b: 'a6' },
    steps: [
      {
        move: 'd4 g7',
        label: /Берсерк/,
        say: t('Взяв — і одразу стрибає по наступну жертву'),
        then: t('❄ Після ланцюга пропускає хід'),
      },
    ],
  },
  'knight-rider': {
    pieces: { d4: 'hero!', e6: 'w:pawn!', c8: 'b:bishop' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd4 e6',
        label: /Посадити/,
        say: t('Стрибає на свого пішака — той сідає верхи'),
      },
      {
        move: 'c8 e6',
        say: t('Слон б\'є Вершника…'),
        then: t('…пішак-пасажир гине, а кінь вилітає з сідла'),
      },
      {
        choose: 'f4',
        say: t('Кінь сам обирає, куди відстрибнути'),
        then: t('❄ Врятувався, але пропускає хід'),
      },
    ],
  },
  'knight-mirage': {
    pieces: { d4: 'hero!', e8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd4 f5',
        label: /Міраж/,
        say: t('Кнопка: стрибок, а навколо — ілюзії коня'),
      },
      {
        move: 'e8 e6',
        say: t('Суперник не знає, який кінь справжній, і б\'є…'),
        then: t('…ілюзію. Хід згорів'),
      },
    ],
  },

  // ── Ферзі ──
  'queen-classic': {
    pieces: { d1: 'hero', h5: 'b:rook' },
    steps: [{ move: 'd1 h5', say: t('Ходить і б\'є по прямих і діагоналях') }],
  },
  'queen-ricochet': {
    pieces: { e3: 'hero!', b8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e3', say: t('Фіолетові клітинки — кінці рикошетів від краю') },
      {
        move: 'e3 b8',
        label: /Рикошет/,
        say: t('Дійшла до краю — і рикошетом далі'),
        then: t('Звичайний ферзь сюди б не дістав'),
      },
    ],
  },
  'queen-amazon': {
    pieces: {
      d4: 'hero!',
      c5: 'w:pawn',
      d5: 'w:pawn',
      e5: 'w:pawn',
      e6: 'b:rook',
    },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: t('Фіолетові — стрибки коня, яких немає у ферзя') },
      { move: 'd4 e6', say: t('Ще й стрибає й б\'є як кінь') },
    ],
  },
  'queen-levitation': {
    pieces: { d4: 'hero!', a3: 'b:rook' },
    kings: { b: 'h8' },
    ring: true,
    steps: [
      {
        move: 'd4 d↑',
        label: /Левітація/,
        say: t('Виходить за край дошки — на платформу'),
        then: t('Платформа тримає 3 ходи суперника'),
      },
      { move: 'a3 d3', say: t('Суперник ходить…') },
      { move: 'hero d3', say: t('Ферзь пікірує з платформи й б\'є') },
    ],
  },
  'queen-immortal': {
    pieces: { d4: 'hero!^d1', d8: 'b:rook', a2: 'w:pawn' },
    kings: { b: 'h8' },
    steps: [
      {
        ability: 'd4',
        key: /arm/,
        say: t('Кнопка (хід не витрачає): безсмертя на хід суперника'),
      },
      { move: 'a2 a3', say: t('Суперник не бачить, що щит увімкнено') },
      {
        move: 'd8 d4',
        say: t('Тура б\'є ферзя…'),
        then: t('✨ …а вона воскресає на стартовій клітинці'),
      },
    ],
  },

  // ── Королі ──
  'king-classic': {
    pieces: { e1: 'hero', h1: 'w:rook' },
    steps: [
      {
        move: 'e1 g1',
        label: /Рокіровка/,
        say: t('Ходить на 1 клітинку й робить рокіровку'),
      },
    ],
  },
  'king-wanderer': {
    pieces: { e1: 'hero', e3: 'b:knight' },
    steps: [
      { marks: 'e1', say: t('Лише по прямій, зате на 1–2 клітинки') },
      { move: 'e1 e3', say: t('Б\'є через клітинку') },
    ],
  },
  'king-swapper': {
    pieces: { e1: 'hero', b1: 'w:rook', e8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e1', say: t('Фіолетові — обмін зі своєю фігурою на 1-му ряду') },
      {
        move: 'e1 b1',
        label: /Обмін/,
        say: t('Раз за гру міняється місцями зі своєю фігурою на 1-му ряду'),
        then: t('Обмін витрачено, рокіровки більше немає'),
      },
    ],
  },
  'king-barricade': {
    pieces: {
      g1: 'hero!',
      f2: 'w:pawn!',
      g2: 'w:pawn!',
      h2: 'w:pawn!',
      a7: 'b:rook',
    },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'a7 a1',
        say: t('Тура ставить мат по першому ряду…'),
        then: t('🧱 Барикада! Свій пішак перекриває лінію'),
      },
    ],
  },
  'king-hint': {
    pieces: { e1: 'hero', d1: 'w:queen', h5: 'b:rook', a5: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      {
        ability: 'e1',
        key: /show/,
        say: t('Кнопка (хід не витрачає): підказка рушія'),
        show: 'd1 h5',
      },
      { move: 'd1 h5', say: t('Найкращий хід — і ви його бачите') },
    ],
  },
  'king-comet': {
    pieces: { e1: 'hero', e6: 'b:knight' },
    steps: [
      { marks: 'e1', say: t('Ривок до 5 клітинок (фіолетові)') },
      {
        move: 'e1 e6',
        label: /Ривок/,
        say: t('Кнопка: ривок до 5 клітинок по прямій'),
        then: t('⏳ Далі перезарядка 6 ходів'),
      },
    ],
  },
};
