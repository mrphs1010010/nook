import { Fragment } from 'react';

export interface Mark {
  start: number;
  end: number;
  className: string;
}

// Text with parts of it wrapped in <mark>. Marks are in order and don't overlap.
export function Highlighted({ text, marks }: { text: string; marks: Mark[] }) {
  let at = 0;
  const parts = marks.map((mark) => {
    const before = text.slice(at, mark.start);
    at = mark.end;
    return (
      <Fragment key={mark.start}>
        {before}
        <mark className={mark.className}>{text.slice(mark.start, mark.end)}</mark>
      </Fragment>
    );
  });
  return (
    <>
      {parts}
      {text.slice(at)}
    </>
  );
}
