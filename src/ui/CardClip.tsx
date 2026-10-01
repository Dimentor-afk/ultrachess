import { useEffect, useMemo, useState } from 'react';
import { fileOf, rankOf } from '../engine/coords';
import type { Square } from '../engine/types';
import { pieceSprite } from './cardArt';
import { buildClip, type ClipItem } from './cardDemo';

/**
 * The card's clip, like the card videos in Clash Royale: a short scene on a
 * small board that shows the card's trick, with subtitles. Tap to replay.
 */
export function CardClip({ cardId }: { cardId: string }) {
  const clip = useMemo(() => buildClip(cardId), [cardId]);
  const [i, setI] = useState(0);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!clip) return;
    const scene = clip.scenes[i];
    const last = i === clip.scenes.length - 1;
    const t = setTimeout(
      () => {
        if (last) {
          setI(0);
          setRound((r) => r + 1);
        } else setI(i + 1);
      },
      scene.ms + (last ? 500 : 0),
    );
    return () => clearTimeout(t);
  }, [clip, i, round]);

  if (!clip) return null;
  const scene = clip.scenes[i];
  const n = clip.ring ? 10 : 8;
  const cell = 100 / n;
  const at = (s: Square) => ({
    left: `${(fileOf(s) + (clip.ring ? 1 : 0)) * cell}%`,
    top: `${(n - 1 - rankOf(s) - (clip.ring ? 1 : 0)) * cell}%`,
    width: `${cell}%`,
    height: `${cell}%`,
  });
  // Subtitles change per step, not per frame: progress counts captions.
  const captions = clip.scenes.map((s) => s.caption).filter((c, k, all) => c !== all[k - 1]);
  const stepNo = clip.scenes.slice(0, i + 1).filter((s, k, all) => k === 0 || s.caption !== all[k - 1].caption).length;

  const piece = (it: ClipItem) => (
    <span
      key={it.key}
      className={`clip-piece ${it.state} ${it.hero ? 'hero' : ''} ${scene.moving === it.key ? 'moving' : ''} ${it.warp ? 'warp' : ''}`}
      style={at(it.square)}
    >
      <img className="pixel" src={pieceSprite(it.cardId, it.type, it.color, 'dark').src} alt="" draggable={false} />
      {it.frozen && <span className="clip-badge frozen">❄</span>}
      {it.rider && <span className="clip-badge rider">♟</span>}
      {it.state === 'illusion' && <span className="clip-badge ghost">?</span>}
    </span>
  );

  return (
    <figure
      className={`clip ${clip.ring ? 'ring' : ''}`}
      onClick={() => {
        setI(0);
        setRound((r) => r + 1);
      }}
      title="Натисніть, щоб переглянути ще раз"
    >
      <div className="clip-steps" aria-hidden>
        {captions.map((_, k) => (
          <span key={k} className={k < stepNo ? 'on' : ''} />
        ))}
      </div>
      <div className="clip-board" key={round}>
        <div className="clip-squares" style={clip.ring ? { inset: `${cell}%` } : undefined} />
        {scene.platforms.map((s) => (
          <span key={`p${s}`} className="clip-cell platform" style={at(s)} />
        ))}
        {scene.barrier.map((s) => (
          <span key={`b${s}`} className="clip-cell barrier" style={at(s)} />
        ))}
        {scene.aim.map((s, k) => (
          <span key={`a${s}-${k}`} className={`clip-cell aim ${s === scene.target ? 'target' : ''}`} style={at(s)}>
            <span />
          </span>
        ))}
        {scene.marks.map(([s, kind]) => (
          <span key={`m${s}`} className={`clip-cell mark ${kind}`} style={at(s)}>
            <span />
          </span>
        ))}
        {scene.items.map(piece)}
        {scene.flash.map((s) => (
          <span key={`f${s}-${i}`} className="clip-cell flash" style={at(s)} />
        ))}
      </div>
      <figcaption className={`clip-caption ${scene.who}`} key={scene.caption} aria-live="polite">
        {scene.caption}
      </figcaption>
    </figure>
  );
}
