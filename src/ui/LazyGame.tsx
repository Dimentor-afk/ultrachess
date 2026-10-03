import { type ComponentProps, Suspense, lazy } from 'react';
import { t } from '../i18n';

// The game screen (board, animations, move staging) loads only when a game
// starts: the menus open faster, especially on phones.
const GameScreen = lazy(() => import('./MatchPage').then((m) => ({ default: m.Game })));

export function Game(props: ComponentProps<typeof GameScreen>) {
  return (
    <Suspense fallback={<p className="muted page-loading">{t('Готуємо дошку…')}</p>}>
      <GameScreen {...props} />
    </Suspense>
  );
}
