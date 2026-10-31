import type { CSSProperties } from 'react';

// The fan's first letter on a color picked from their chat, so a fan keeps one color
// everywhere in the panel. A dot marks a chat with unread messages.
export function Avatar({ name, seed, size = 40, unread = false }: { name: string; seed: string; size?: number; unread?: boolean }) {
  let hue = 0;
  for (const char of seed) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  const letter = name.replace(/^@/, '').trim().charAt(0).toUpperCase() || '?';
  const style = { '--hue': hue, width: size, height: size, fontSize: Math.round(size * 0.42) } as CSSProperties;
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {letter}
      {unread && <span className="unread-dot" />}
    </span>
  );
}
