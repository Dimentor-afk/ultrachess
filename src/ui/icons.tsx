// Stroke icons for navigation and UI (24×24).

const PATHS: Record<string, string> = {
  play: 'M5 3l14 9-14 9V3z',
  cards: 'M4 6h11v15H4zM8 3h11v15',
  deck: 'M3 5h18v6H3zM3 13h18v6H3zM7 5v14M11 5v14M15 5v14',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 .01 0',
  gift: 'M3 8h18v4H3zM5 12h14v9H5zM12 8v13M12 8S9 3 7 4.5 8.5 8 12 8zM12 8s3-5 5-3.5S15.5 8 12 8z',
  swap: 'M4 8h15M15 4l4 4-4 4M20 16H5M9 12l-4 4 4 4',
  info: 'M12 3a9 9 0 1 0 .01 0M12 11v6M12 7.5v.5',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  sword:'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2',
};

export function Icon({ name, className = '' }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`icon ${className}`} aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
