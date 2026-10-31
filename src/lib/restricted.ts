// Words the creator must never send: a site's banned terms, or anything that takes a fan off
// the platform (payment apps, other messengers). Only whole words match, so "class" never
// trips "ass", but the usual disguises do: P.a.y-P.a.l, c4sh, Cyrillic look-alikes. A "*" at
// either end of an entry matches part of a word: "pay*" finds "payment", "*gram" "instagram".
// Allowed words are never flagged, even when the list has them or a "*" entry covers them
// (the creator's own @name under "@*").

export interface Match {
  start: number;
  end: number; // exclusive
  word: string; // the list entry that matched
}

export interface WordRules {
  block: string[];
  allow: string[];
}

// Characters that pass for a letter.
const LOOKALIKES: Record<string, string> = {
  a: 'aа@4',
  c: 'cс',
  e: 'eе3',
  i: 'iі1!|',
  l: 'l1|',
  o: 'oо0',
  p: 'pр',
  s: 'sѕ$5',
  t: 't7',
  x: 'xх',
  y: 'yу',
};
const SEPARATORS = /^[\s.,\-_*·•]$/u; // what may sit between the letters, up to 3 of them: "p.a.y pal", "c-a-s-h"
const MAX_SEPARATORS = 3;
const SEPARATORS_IN_ENTRY = /[\s.\-_·•]+/g; // "cash app" and "cash-app" mean "cashapp"
const IS_WORD_CHAR = /^[\p{L}\p{N}_]$/u;

const charAt = (text: string, i: number) => String.fromCodePoint(text.codePointAt(i)!);
const charBefore = (text: string, i: number) => (i > 1 && /[\uDC00-\uDFFF]/.test(text[i - 1]!) ? text.slice(i - 2, i) : text.slice(i - 1, i));
const isWordChar = (char: string) => char !== '' && IS_WORD_CHAR.test(char);

interface Rule {
  word: string;
  letters: Set<string>[]; // what each letter may be, in lower case
  openStart: boolean; // starts with "*": may begin inside a word
  openEnd: boolean; // ends with "*": runs on to the end of the word
}

function rule(entry: string): Rule | null {
  const word = entry.trim();
  const letters = [...word.replace(/^\*+|\*+$/g, '').toLowerCase().replace(SEPARATORS_IN_ENTRY, '')];
  if (!letters.length) return null;
  return {
    word,
    letters: letters.map((char) => new Set([...(LOOKALIKES[char] ?? char)].map((c) => c.toLowerCase()))),
    openStart: word.startsWith('*'),
    openEnd: word.endsWith('*'),
  };
}

// Where an entry's letters end if they start at `i`, or -1. Up to three separators may sit
// between letters; as many as fit are tried first.
function lettersEnd(text: string, i: number, letters: Set<string>[], k = 0): number {
  if (i >= text.length) return -1;
  const char = charAt(text, i);
  if (!letters[k]!.has(char.toLowerCase())) return -1;
  const next = i + char.length;
  if (k === letters.length - 1) return next;
  const gaps = [next];
  for (let p = next; gaps.length <= MAX_SEPARATORS && p < text.length && SEPARATORS.test(charAt(text, p)); ) {
    p += charAt(text, p).length;
    gaps.push(p);
  }
  for (let g = gaps.length - 1; g >= 0; g--) {
    const end = lettersEnd(text, gaps[g]!, letters, k + 1);
    if (end >= 0) return end;
  }
  return -1;
}

// Lists run to hundreds of entries, checked as the creator types, so each entry is tried only
// where it could begin: at a word starting with its first letter (or a look-alike), or
// anywhere for entries starting with "*". No expressions: hundreds of them take a second to
// get ready on first use.
function compile(words: string[]) {
  const byFirst = new Map<string, Rule[]>();
  for (const entry of words) {
    const r = rule(entry);
    for (const char of r?.letters[0] ?? []) {
      const list = byFirst.get(char);
      if (list) list.push(r!);
      else byFirst.set(char, [r!]);
    }
  }
  return byFirst;
}

function findAll(byFirst: ReturnType<typeof compile>, text: string): Match[] {
  const found: Match[] = [];
  let previous = '';
  for (let i = 0; i < text.length; ) {
    const char = charAt(text, i);
    const atWordStart = !isWordChar(previous);
    for (const { word, letters, openStart, openEnd } of byFirst.get(char.toLowerCase()) ?? []) {
      if (!atWordStart && !openStart) continue;
      let end = lettersEnd(text, i, letters);
      if (end < 0) continue;
      if (openEnd) while (end < text.length && isWordChar(charAt(text, end))) end += charAt(text, end).length;
      else if (end < text.length && isWordChar(charAt(text, end))) continue; // only part of a word
      let start = i;
      if (openStart) while (start > 0 && isWordChar(charBefore(text, start))) start -= charBefore(text, start).length;
      found.push({ start, end, word });
    }
    previous = char;
    i += char.length;
  }
  return found;
}

// Compiles the lists once; the returned function finds their words in a text, in order and
// without overlaps.
export function wordMatcher({ block, allow }: WordRules): (text: string) => Match[] {
  const blocks = compile(block);
  const allows = compile(allow);

  return (text) => {
    const allowed = findAll(allows, text);
    const found = findAll(blocks, text).filter((match) => !allowed.some((a) => a.start <= match.start && match.end <= a.end));
    found.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged: Match[] = [];
    for (const match of found) {
      const last = merged.at(-1);
      if (last && match.start < last.end) last.end = Math.max(last.end, match.end);
      else merged.push({ ...match });
    }
    return merged;
  };
}

// One plain list, nothing allowed.
export const restrictedMatcher = (words: string[]) => wordMatcher({ block: words, allow: [] });

// Words and phrases, separated by commas, semicolons, tabs or lines, as typed, pasted or
// read from a .txt or .csv file.
export function splitWords(text: string): string[] {
  return text
    .split(/[,;\t\r\n]/)
    .map((word) => word.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean);
}
