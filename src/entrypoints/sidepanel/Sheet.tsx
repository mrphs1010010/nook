import { type ReactNode, useEffect } from 'react';

// A panel that slides up over the rest, for templates and AI. Its header has a close (or
// back) button; Escape or a click outside closes it too. No drag handle: it can't be swiped.
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </>
  );
}
