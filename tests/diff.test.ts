import { describe, expect, it } from 'vitest';
import { diffWords } from '@/lib/diff';

// Puts the diff back together: what it says the text was, and what it became.
const sides = (changes: ReturnType<typeof diffWords>) => ({
  before: changes.filter((c) => c.kind !== 'added').map((c) => c.text).join(''),
  after: changes.filter((c) => c.kind !== 'removed').map((c) => c.text).join(''),
});

describe('diffWords', () => {
  it('marks the words that changed', () => {
    expect(diffWords("i'll send the vid tonite", "I'll send the video tonight")).toEqual([
      { kind: 'removed', text: "i'll" },
      { kind: 'added', text: "I'll" },
      { kind: 'same', text: ' send the ' },
      { kind: 'removed', text: 'vid tonite' },
      { kind: 'added', text: 'video tonight' },
    ]);
  });

  it('finds added punctuation', () => {
    expect(diffWords('hey babe', 'hey, babe!')).toEqual([
      { kind: 'same', text: 'hey' },
      { kind: 'added', text: ',' },
      { kind: 'same', text: ' babe' },
      { kind: 'added', text: '!' },
    ]);
  });

  it('reports no changes for the same text', () => {
    expect(diffWords('miss you 😘', 'miss you 😘')).toEqual([{ kind: 'same', text: 'miss you 😘' }]);
  });

  it('always adds up to both texts', () => {
    const before = 'so u wanna see the new set or nah? its realy hot';
    const after = 'So, do you want to see the new set? It’s really hot 🔥';
    expect(sides(diffWords(before, after))).toEqual({ before, after });
  });

  it('gives up on finding words in huge texts and shows a full swap', () => {
    const before = 'a '.repeat(600);
    const after = 'b '.repeat(600);
    expect(diffWords(before, after)).toEqual([
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ]);
  });
});
