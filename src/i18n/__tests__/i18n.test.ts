import { afterAll, describe, expect, it } from 'vitest';
import { loadLang, t, tr } from '..';
import de from '../de';
import en from '../en';
import es from '../es';
import it_ from '../it';

describe('translations', () => {
  afterAll(() => loadLang('uk'));

  it('Ukrainian is the source: keys come back as they are, with placeholders filled', async () => {
    await loadLang('uk');
    expect(t('Колода')).toBe('Колода');
    expect(t('Потрібно {0} уламків, у вас {1}.', 400, 20)).toBe('Потрібно 400 уламків, у вас 20.');
    expect(tr('Мат')).toBe('Мат');
  });

  it('every language has the same keys', () => {
    const keys = Object.keys(en).sort();
    for (const d of [de, it_, es]) expect(Object.keys(d).sort()).toEqual(keys);
  });

  it('translates UI text and server or engine text in English', async () => {
    await loadLang('en');
    expect(t('Колода')).toBe('Deck');
    // A server error with numbers in it, matched against its template.
    expect(tr('Потрібно 400 уламків, у вас 20.')).toBe('You need 400 shards, you have 20.');
    // Move history: piece names, the move label and the events after "; ".
    expect(tr('Тура d1–e2 (Тихий крок)')).toBe('Rook d1–e2 (Quiet step)');
    expect(tr('Кінь e4×f6; Смертник забрав із собою: Кінь')).toBe('Knight e4×f6; The Kamikaze took with it: Knight');
    expect(tr('Пішак e7–e8 = Ферзь')).toBe('Pawn e7–e8 = Queen');
    expect(tr('Король: рокіровка e1–g1')).toBe('King: castling e1–g1');
    // A card name inside an event.
    expect(tr('Левітаційний слон впав із платформи')).toBe('Levitating Bishop fell off the platform');
    expect(tr('Стрибок 3+1 зі взяттям')).toBe('Jump 3+1 with capture');
    // Unknown text (a player's name) stays as it is.
    expect(tr('Дмитро')).toBe('Дмитро');
  });

  it('German move lines use German piece names', async () => {
    await loadLang('de');
    expect(tr('Слон c1×h6')).toBe('Läufer c1×h6');
    expect(tr('Мат')).toBe('Schachmatt');
  });
});
