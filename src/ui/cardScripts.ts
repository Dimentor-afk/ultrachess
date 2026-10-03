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
      { move: 'e2 e4', say: 'Першим ходом — на 2 клітинки вперед' },
      { move: 'e4 d5', say: "Б'є по діагоналі вперед" },
    ],
  },
  'pawn-stormer': {
    pieces: { e3: 'hero!', e4: 'b:knight', d4: 'b:pawn', f4: 'b:bishop' },
    steps: [
      { marks: 'e3', say: "По діагоналі не б'є — тільки прямо вперед" },
      { move: 'e3 e4', say: "Б'є фігуру прямо перед собою" },
    ],
  },
  'pawn-retreater': {
    pieces: { e4: 'hero!', d6: 'b:pawn' },
    steps: [
      { move: 'd6 d5', say: 'Ворожий пішак загрожує…' },
      {
        move: 'e4 e3',
        label: /Відступ/,
        say: '…а Відступник крокує на 1 назад',
      },
    ],
  },
  'pawn-oblique': {
    pieces: { e2: 'hero', e3: 'b:knight' },
    steps: [
      {
        move: 'e2 f3',
        label: /Косий/,
        say: 'Раз за гру — крок по діагоналі на вільну клітинку',
        then: '❄ Після цього пропускає наступний хід',
      },
    ],
  },
  'pawn-ram': {
    pieces: { e4: 'hero!', e5: 'b:pawn' },
    steps: [
      {
        move: 'e4 e5',
        label: /Таран/,
        say: 'Раз за гру штовхає ворожого пішака назад',
        then: '…і займає його клітинку',
      },
    ],
  },
  'pawn-diagonal': {
    pieces: { e2: 'hero', e3: 'b:knight', d4: 'b:pawn' },
    steps: [
      { move: 'e2 d3', say: 'Ходить по діагоналі вперед' },
      { move: 'd3 d4', say: "А б'є — прямо вперед" },
    ],
  },
  'pawn-sprinter': {
    pieces: { e4: 'hero!', d7: 'b:pawn' },
    steps: [
      { marks: 'e4', say: 'Уже ходив, а ривок на 2 є (фіолетове)' },
      {
        move: 'e4 e6',
        label: /Спринт/,
        say: 'Раз за гру — ривок на 2 з будь-якої клітинки',
        then: 'Ривок витрачено — далі звичайний пішак',
      },
    ],
  },
  'pawn-stubborn': {
    pieces: { e4: 'hero!', e5: 'b:knight' },
    steps: [
      {
        move: 'e4 e5',
        label: /Помінятися/,
        say: 'Раз за гру міняється місцями з ворогом попереду',
        then: '❄ Після обміну пропускає хід',
      },
    ],
  },
  'pawn-marathoner': {
    pieces: { e2: 'hero', d7: 'b:pawn' },
    steps: [
      { marks: 'e2', say: 'Першим ходом — аж до 3 клітинок' },
      {
        move: 'e2 e5',
        label: /Марафон/,
        say: 'Першим ходом — одразу 3 клітинки вперед',
      },
    ],
  },
  'pawn-phantom': {
    pieces: { e4: 'hero!', e5: 'b:pawn' },
    steps: [
      {
        move: 'e4 e6',
        label: /Фантом/,
        say: 'Раз за гру проходить крізь фігуру попереду',
        then: 'Після стрибка вже не перетвориться на 8-му ряду',
      },
    ],
  },
  'pawn-spearman': {
    pieces: { e3: 'hero!', e5: 'b:knight' },
    steps: [
      {
        move: 'e3 e5',
        label: /списом/,
        say: "Списом б'є через клітинку",
        then: '…і сам робить крок уперед',
      },
    ],
  },
  'pawn-ambusher': {
    pieces: { e4: 'hero!', b6: 'b:knight' },
    steps: [
      {
        move: 'b6 d5',
        say: 'Ворожий кінь стає по діагоналі перед Засідником…',
        then: '…Засідник забирає його, але гине сам',
      },
    ],
  },
  'pawn-shieldbearer': {
    pieces: { e4: 'hero!', d5: 'b:pawn' },
    steps: [
      {
        move: 'd5 e4',
        say: "Ворожий пішак б'є Щитоносця…",
        then: '🛡 …а той вистояв і відступив на 1 назад',
      },
    ],
  },
  'pawn-duelist': {
    pieces: { e4: 'hero!', d5: 'b:knight' },
    steps: [
      {
        move: 'e4 d5',
        label: /повернутись/,
        say: "Б'є — і одразу повертається на свою клітинку",
        then: '❄ Повернувся — пропускає наступний хід',
      },
    ],
  },

  // ── Слони ──
  'bishop-classic': {
    pieces: { c1: 'hero', g5: 'b:knight' },
    steps: [{ move: 'c1 g5', say: "Ходить і б'є по діагоналі на будь-яку відстань" }],
  },
  'bishop-sentinel': {
    pieces: { d4: 'hero!', d6: 'b:knight', g7: 'b:pawn' },
    steps: [
      { marks: 'd4', say: 'Ходить як ферзь, але лише на 1–2 клітинки' },
      { move: 'd4 d6', say: "Тож б'є навіть по прямій" },
    ],
  },
  'bishop-sniper': {
    pieces: { d4: 'hero!', e5: 'b:pawn', b6: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: "Впритул не б'є — ціль має бути за 2+ клітинки" },
      {
        move: 'd4 b6',
        label: /пройти/,
        say: "Здалеку б'є…",
        then: '…і проходить ще 1 клітинку далі',
      },
    ],
  },
  'bishop-paratrooper': {
    pieces: { c1: 'hero', ...ROW2 },
    steps: [
      { marks: 'c1', say: 'Свої пішаки закрили дорогу, але…' },
      {
        move: 'c1 e3',
        label: /Десант/,
        say: '…першим ходом слон перестрибує свого пішака',
        then: '❄ Після десанту пропускає хід. Далі — як звичайний слон',
      },
    ],
  },
  'bishop-jumper': {
    pieces: { c1: 'hero', d2: 'w:pawn', e5: 'b:pawn!' },
    steps: [
      { marks: 'c1', say: 'Пішак упритул: без розгону стрибнути не можна' },
      { move: 'c1 b2', say: 'Тож іде звичайно' },
      { move: 'a8 b8', say: 'Суперник ходить…' },
      { marks: 'hero', say: 'Перед пішаком e5 дві вільні клітинки — є розгін (фіолетове)' },
      { move: 'b2 f6', label: /Перестрибнути/, say: 'Перестрибнув і став одразу за ним', then: 'Через свої пішаки на старті так не вийде — це трюк Десантника' },
    ],
  },
  'bishop-martyr': {
    pieces: { d4: 'hero!', d8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd8 d4',
        say: "Ворожа тура б'є Мученика…",
        then: '❄ …і завмирає на 2 свої ходи',
      },
    ],
  },
  'bishop-ricochet': {
    pieces: { e3: 'hero!', b8: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e3', say: 'Фіолетові клітинки — кінці рикошетів від краю' },
      {
        move: 'e3 b8',
        label: /Рикошет/,
        say: 'Дійшов до краю — і рикошетом на нову діагональ',
        then: 'Звичайний слон сюди б не дістав',
      },
    ],
  },
  'bishop-illusionist': {
    pieces: { d4: 'hero!', a7: 'b:bishop' },
    kings: { b: 'b8' },
    steps: [
      { move: 'd4 f6', say: 'Іде, а на старій клітинці лишає невидиму копію' },
      {
        move: 'a7 d4',
        say: "Суперник бачить дві фігури й б'є не ту…",
        then: '…ілюзія розвіялась, хід суперника згорів',
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
        say: "Б'є ворога крізь іншу фігуру…",
        then: '…але й сам гине',
      },
    ],
  },
  'bishop-chain': {
    pieces: { c1: 'hero!', d6: 'b:knight' },
    steps: [
      { marks: 'c1', say: 'Фіолетові — клітинки, куди веде хід із поворотом' },
      {
        move: 'c1 d6',
        label: /поворот/,
        say: 'До 3 клітинок, поворот — і ще до 2',
      },
    ],
  },
  'bishop-chameleon': {
    pieces: { d4: 'hero!', g8: 'b:rook' },
    steps: [
      {
        move: 'd4 d5',
        label: /колір/,
        say: 'Замість ходу — крок на клітинку іншого кольору',
      },
      { move: 'd5 g8', say: 'Тепер полює на світлих клітинках' },
    ],
  },
  'bishop-flanker': {
    pieces: { a3: 'hero!', a5: 'b:knight' },
    steps: [
      { marks: 'a3', say: 'На краю — стрибок через клітинку (фіолетові)' },
      {
        move: 'a3 a5',
        label: /краю/,
        say: 'На краю стрибає вздовж краю на свій колір',
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
        say: 'Виходить за край дошки — на платформу',
        then: 'Платформа тримає 3 ходи суперника',
      },
      { move: 'a3 c3', say: 'Суперник ходить…' },
      { move: 'hero c3', say: "Слон повертається з платформи й б'є" },
    ],
  },
  'bishop-portal': {
    pieces: { e3: 'hero!', b4: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e3', say: 'Фіолетові клітинки — куди слон дістає через портал' },
      { move: 'e3 b4', label: /портал/i, say: 'За край — і з дзеркального боку, з\'їдає коня' },
      { move: 'h8 g8', say: 'Суперник ходить…' },
      { marks: 'hero', say: 'Портал знову працює — і так щоходу' },
    ],
  },
  'bishop-eclipse': {
    pieces: { d4: 'hero!', h3: 'b:queen' },
    kings: { w: 'b1', b: 'a8' },
    steps: [
      {
        ability: 'd4',
        key: /diag:1:/,
        say: "Кнопка: бар'єр на діагональ слона",
      },
      { move: 'b1 c2', say: 'Хід не витрачено — тепер звичайний хід' },
      { marks: 'h3', say: 'Наступним ходом ферзь не може перетнути бар’єр' },
    ],
  },

  // ── Тури ──
  'rook-classic': {
    pieces: { d1: 'hero', d7: 'b:pawn' },
    steps: [{ move: 'd1 d7', say: "Ходить і б'є по прямій на будь-яку відстань" }],
  },
  'rook-sniper': {
    pieces: { d4: 'hero!', d5: 'b:pawn', g4: 'b:knight' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: "Впритул не б'є — ціль має бути за 2+ клітинки" },
      {
        move: 'd4 g4',
        label: /пройти/,
        say: "Здалеку б'є…",
        then: '…і проходить ще 1 клітинку далі',
      },
    ],
  },
  'rook-paratrooper': {
    pieces: { a1: 'hero', ...ROW2, b1: 'w:knight' },
    steps: [
      { marks: 'a1', say: 'Свої фігури закрили дорогу, але…' },
      {
        move: 'a1 a3',
        label: /Десант/,
        say: '…першим ходом тура перестрибує свого пішака',
        then: '❄ Після десанту пропускає хід. Далі — як звичайна тура',
      },
    ],
  },
  'rook-maneuver': {
    pieces: { d4: 'hero!', g7: 'b:knight', d8: 'b:pawn' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: 'Ходить ще й по діагоналі, але не далі 4 клітинок' },
      { move: 'd4 g7', say: "Б'є по діагоналі" },
    ],
  },
  'rook-jumper': {
    pieces: { d1: 'hero', d2: 'w:pawn', d6: 'b:knight' },
    steps: [
      { marks: 'd1', say: 'Пішак упритул: без розгону стрибнути не можна' },
      { move: 'd2 d3', say: 'Пішак пішов уперед…' },
      { move: 'a8 b8', say: 'Суперник ходить…' },
      { marks: 'hero', say: 'Тепер перед пішаком є вільна клітинка — розгін (фіолетове)' },
      { move: 'd1 d4', label: /Перестрибнути/, say: 'Перестрибнула й стала одразу за ним', then: 'Через свої пішаки на старті так не вийде — це трюк Десантної тури' },
    ],
  },
  'rook-ricochet': {
    pieces: { d4: 'hero!', e8: 'b:knight' },
    steps: [
      { marks: 'd4', say: 'Фіолетові клітинки — кінці рикошетів від краю' },
      {
        move: 'd4 e8',
        label: /Рикошет/,
        say: 'Дійшла до краю — і рикошетом на 1 убік',
        then: 'Звичайна тура сюди б не дістала',
      },
    ],
  },
  'rook-illusionist': {
    pieces: { d4: 'hero!', a7: 'b:bishop' },
    kings: { b: 'h8' },
    steps: [
      { move: 'd4 d6', say: 'Іде, а на старій клітинці лишає невидиму копію' },
      {
        move: 'a7 d4',
        say: "Суперник бачить дві тури й б'є не ту…",
        then: '…ілюзія розвіялась, хід суперника згорів',
      },
    ],
  },
  'rook-tunnel': {
    pieces: { d1: 'hero!', d2: 'w:pawn', d3: 'w:knight', d7: 'b:pawn' },
    steps: [
      { marks: 'd1', say: 'Свої фігури не заважають — шлях відкритий' },
      {
        move: 'd1 d7',
        say: 'Проходить крізь свої фігури, як тунелем',
        then: 'Звичайну туру свої пішак і кінь зупинили б',
      },
    ],
  },
  'rook-corner': {
    pieces: { d1: 'hero!', f3: 'b:knight' },
    steps: [
      { marks: 'd1', say: 'Фіолетові — клітинки, куди веде хід із поворотом' },
      {
        move: 'd1 f3',
        label: /поворот/,
        say: 'До 3 клітинок, поворот на 90° — і ще до 2',
        then: 'Звичайна тура так не вміє',
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
        say: 'Раз за гру проходить крізь ворога…',
        then: "…і б'є того, хто стоїть за ним",
      },
    ],
  },
  'rook-displacer': {
    pieces: { d1: 'hero!', d3: 'w:knight' },
    steps: [
      {
        move: 'd1 d3',
        label: /Витіснити/,
        say: 'Стає на клітинку своєї фігури',
        then: '…а ту відштовхує на 1 далі',
      },
    ],
  },
  'rook-kamikaze': {
    pieces: { d4: 'hero!', f5: 'b:knight' },
    steps: [
      {
        move: 'f5 d4',
        say: "Ворожий кінь б'є Смертника…",
        then: '💥 …і гине разом із ним',
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
        say: 'Шах! Раз за гру тура телепортується до короля',
        then: '…і закриває його від ферзя',
      },
    ],
  },
  'rook-fortress': {
    pieces: { d4: 'hero!', f5: 'b:knight' },
    steps: [
      {
        move: 'f5 d4',
        say: "Ворожий кінь б'є Фортечну туру…",
        then: '🛡 …вона вистояла й відійшла (❄ пропускає хід)',
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
        say: 'Кнопка: обираєте лінію без королів…',
        then: '…і всі фігури на ній зсуваються на 1',
      },
      { move: 'd1 d4', say: 'Хід не витрачено — тура ще й ходить' },
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
    steps: [{ move: 'd4 e6', say: 'Стрибає буквою «Г» — прямо через фігури' }],
  },
  'knight-camel': {
    pieces: { d4: 'hero!', e7: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: 'Стрибає 3+1 замість 2+1' },
      { move: 'd4 e7', say: 'Дістає далі за звичайного коня' },
    ],
  },
  'knight-herald': {
    pieces: { d2: 'hero', d3: 'w:pawn', d4: 'b:knight' },
    steps: [
      { marks: 'd2', say: 'Свій пішак попереду — а Гінцю байдуже' },
      {
        move: 'd2 d4',
        label: /2/,
        say: 'Лише першим ходом — стрибок на 2 прямо вперед',
      },
    ],
  },
  'knight-diagonal': {
    pieces: { d2: 'hero', e3: 'w:pawn', f4: 'b:knight' },
    steps: [
      {
        marks: 'd2',
        say: 'Фіолетове — стрибок, якого немає у звичайного коня',
      },
      {
        move: 'd2 f4',
        label: /діагонал/,
        say: 'Лише першим ходом — стрибок на 2 по діагоналі',
      },
    ],
  },
  'knight-illusionist': {
    pieces: { d4: 'hero!', a7: 'b:bishop' },
    kings: { b: 'h8' },
    steps: [
      {
        move: 'd4 f5',
        say: 'Стрибає, а на старій клітинці лишає невидиму копію',
      },
      {
        move: 'a7 d4',
        say: "Суперник бачить двох коней і б'є не того…",
        then: '…ілюзія розвіялась, хід суперника згорів',
      },
    ],
  },
  'knight-squire': {
    pieces: { d4: 'hero!', c5: 'b:pawn', e5: 'b:pawn' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: 'Крім стрибків — ще й 1 крок по прямій' },
      { move: 'd4 d5', say: 'Тихий крок уперед (без взяття)' },
    ],
  },
  'knight-central': {
    pieces: { d4: 'hero!', e7: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: 'У центрі дошки (c3–f6) — ще й далекі стрибки 3+1' },
      { move: 'd4 e7', say: 'Далекий стрибок зі взяттям' },
    ],
  },
  'knight-brother': {
    pieces: { d4: 'hero!', e4: 'w:knight', e7: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'd4', say: "Поруч свій кінь — з'являються стрибки 3+1" },
      { move: 'd4 e7', say: 'Далекий стрибок зі взяттям' },
    ],
  },
  'knight-wallrunner': {
    pieces: { f3: 'hero!' },
    steps: [
      { marks: 'f3', say: 'Фіолетові — пробіжка вздовж краю після стрибка' },
      {
        move: 'f3 h6',
        label: /краю/,
        say: 'Приземлився на краю — і біжить уздовж нього',
      },
    ],
  },
  'knight-galloper': {
    pieces: { b1: 'hero', e4: 'b:rook' },
    steps: [
      { marks: 'b1', say: 'Першим ходом — два стрибки поспіль (фіолетові)' },
      { move: 'b1 e4', say: 'Першим ходом — два стрибки поспіль' },
    ],
  },
  'knight-springboard': {
    pieces: { e2: 'hero!', f1: 'w:bishop', b5: 'b:rook' },
    steps: [{ move: 'f1 b5', say: 'Свій слон проходить крізь Трамплін' }],
  },
  'knight-rotator': {
    pieces: { d4: 'hero!', d5: 'w:pawn!', d6: 'b:pawn' },
    steps: [
      { marks: 'd4', say: 'Фіолетове — обмін зі своїм пішаком' },
      {
        move: 'd4 d5',
        label: /Помінятися/,
        say: 'Замість стрибка міняється місцями зі своїм пішаком',
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
        say: 'Взяв — і одразу стрибає по наступну жертву',
        then: '❄ Після ланцюга пропускає хід',
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
        say: 'Стрибає на свого пішака — той сідає верхи',
      },
      {
        move: 'c8 e6',
        say: "Слон б'є Вершника…",
        then: '…пішак-пасажир гине, а кінь вилітає з сідла',
      },
      {
        choose: 'f4',
        say: 'Кінь сам обирає, куди відстрибнути',
        then: '❄ Врятувався, але пропускає хід',
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
        say: 'Кнопка: стрибок, а навколо — ілюзії коня',
      },
      {
        move: 'e8 e6',
        say: "Суперник не знає, який кінь справжній, і б'є…",
        then: '…ілюзію. Хід згорів',
      },
    ],
  },

  // ── Ферзі ──
  'queen-classic': {
    pieces: { d1: 'hero', h5: 'b:rook' },
    steps: [{ move: 'd1 h5', say: "Ходить і б'є по прямих і діагоналях" }],
  },
  'queen-ricochet': {
    pieces: { e3: 'hero!', b8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e3', say: 'Фіолетові клітинки — кінці рикошетів від краю' },
      {
        move: 'e3 b8',
        label: /Рикошет/,
        say: 'Дійшла до краю — і рикошетом далі',
        then: 'Звичайний ферзь сюди б не дістав',
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
      { marks: 'd4', say: 'Фіолетові — стрибки коня, яких немає у ферзя' },
      { move: 'd4 e6', say: "Ще й стрибає й б'є як кінь" },
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
        say: 'Виходить за край дошки — на платформу',
        then: 'Платформа тримає 3 ходи суперника',
      },
      { move: 'a3 d3', say: 'Суперник ходить…' },
      { move: 'hero d3', say: "Ферзь пікірує з платформи й б'є" },
    ],
  },
  'queen-immortal': {
    pieces: { d4: 'hero!^d1', d8: 'b:rook', a2: 'w:pawn' },
    kings: { b: 'h8' },
    steps: [
      {
        ability: 'd4',
        key: /arm/,
        say: 'Кнопка (хід не витрачає): безсмертя на хід суперника',
      },
      { move: 'a2 a3', say: 'Суперник не бачить, що щит увімкнено' },
      {
        move: 'd8 d4',
        say: "Тура б'є ферзя…",
        then: '✨ …а вона воскресає на стартовій клітинці',
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
        say: 'Ходить на 1 клітинку й робить рокіровку',
      },
    ],
  },
  'king-wanderer': {
    pieces: { e1: 'hero', e3: 'b:knight' },
    steps: [
      { marks: 'e1', say: 'Лише по прямій, зате на 1–2 клітинки' },
      { move: 'e1 e3', say: "Б'є через клітинку" },
    ],
  },
  'king-swapper': {
    pieces: { e1: 'hero', b1: 'w:rook', e8: 'b:rook' },
    kings: { b: 'h8' },
    steps: [
      { marks: 'e1', say: 'Фіолетові — обмін зі своєю фігурою на 1-му ряду' },
      {
        move: 'e1 b1',
        label: /Обмін/,
        say: 'Раз за гру міняється місцями зі своєю фігурою на 1-му ряду',
        then: 'Обмін витрачено, рокіровки більше немає',
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
        say: 'Тура ставить мат по першому ряду…',
        then: '🧱 Барикада! Свій пішак перекриває лінію',
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
        say: 'Кнопка (хід не витрачає): підказка рушія',
        show: 'd1 h5',
      },
      { move: 'd1 h5', say: 'Найкращий хід — і ви його бачите' },
    ],
  },
  'king-comet': {
    pieces: { e1: 'hero', e6: 'b:knight' },
    steps: [
      { marks: 'e1', say: 'Ривок до 5 клітинок (фіолетові)' },
      {
        move: 'e1 e6',
        label: /Ривок/,
        say: 'Кнопка: ривок до 5 клітинок по прямій',
        then: '⏳ Далі перезарядка 6 ходів',
      },
    ],
  },
};
