// Side outlines baked into the sprite once, on a canvas. Drawing them with
// four chained CSS drop-shadow filters per piece made every repaint of the
// board re-rasterise 32 filtered images, which is what made the game lag.

import { useEffect, useState } from 'react';

const baked = new Map<string, string>();
const loading = new Map<string, Promise<string>>();

function bake(src: string, color: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        // Silhouette of the sprite in one colour.
        const sil = document.createElement('canvas');
        sil.width = w;
        sil.height = h;
        const sc = sil.getContext('2d')!;
        const tint = (fill: string) => {
          sc.globalCompositeOperation = 'source-over';
          sc.clearRect(0, 0, w, h);
          sc.drawImage(img, 0, 0);
          sc.globalCompositeOperation = 'source-in';
          sc.fillStyle = fill;
          sc.fillRect(0, 0, w, h);
          return sil;
        };
        // One pixel of outline around, a two-pixel shadow below.
        const out = document.createElement('canvas');
        out.width = w + 2;
        out.height = h + 3;
        const c = out.getContext('2d')!;
        c.imageSmoothingEnabled = false;
        c.drawImage(tint('rgba(0, 0, 0, 0.45)'), 1, 3);
        tint(color);
        for (const [dx, dy] of [
          [0, 1],
          [2, 1],
          [1, 0],
          [1, 2],
        ]) {
          c.drawImage(sil, dx, dy);
        }
        c.drawImage(img, 1, 1);
        out.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('toBlob'))));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error(`sprite ${src}`));
    img.src = src;
  });
}

/** The sprite with its outline baked in; the plain sprite until it is ready (or if baking fails). */
export function useOutlined(src: string, color: string): { src: string; baked: boolean } {
  const key = `${src}|${color}`;
  const [, bump] = useState(0);
  const ready = baked.get(key);
  useEffect(() => {
    if (baked.has(key)) return;
    let alive = true;
    let p = loading.get(key);
    if (!p) {
      p = bake(src, color);
      loading.set(key, p);
    }
    p.then(
      (url) => {
        baked.set(key, url);
        if (alive) bump((n) => n + 1);
      },
      () => undefined, // keep the CSS outline
    );
    return () => {
      alive = false;
    };
  }, [key, src, color]);
  return ready ? { src: ready, baked: true } : { src, baked: false };
}
