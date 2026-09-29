import type { CSSProperties } from 'react';
import { FX, type FxName } from './fxSprites';

/** A pixel effect sprite outside the board (pack opening and the like). */
export function FxOnce({ name, width, loop = false }: { name: FxName; width: number; loop?: boolean }) {
  const spec = FX[name];
  return (
    <span
      className={`fx fx-once ${loop ? 'fx-loop' : ''}`}
      aria-hidden="true"
      style={
        {
          width,
          aspectRatio: `${spec.w} / ${spec.h}`,
          backgroundImage: `url(assets/fx/${name}.png)`,
          '--n': spec.n,
          animationDuration: `${spec.ms}ms`,
        } as CSSProperties
      }
    />
  );
}
