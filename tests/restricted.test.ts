import { describe, expect, it } from 'vitest';
import { restrictedMatcher, splitWords, wordMatcher } from '@/lib/restricted';
import { BUILT_IN, rulesFor } from '@/lib/wordLists';

const words = (list: string[], text: string) => restrictedMatcher(list)(text).map((m) => text.slice(m.start, m.end));

describe('restrictedMatcher', () => {
  it('finds whole words in any case, with their position', () => {
    const find = restrictedMatcher(['paypal']);
    expect(find('send it to my PayPal pls')).toEqual([{ start: 14, end: 20, word: 'paypal' }]);
  });

  it('leaves words that merely contain an entry alone', () => {
    expect(words(['ass'], 'my class passed, sweet assistant')).toEqual([]);
    expect(words(['ass'], 'nice ass!')).toEqual(['ass']);
  });

  it('sees through spacing, punctuation and look-alike characters', () => {
    expect(words(['paypal'], 'p.a.y.p.a.l or pay pal or p@yp4l')).toEqual(['p.a.y.p.a.l', 'pay pal', 'p@yp4l']);
    expect(words(['paypal'], 'my раураl')).toEqual(['раураl']); // Cyrillic р, а, у
  });

  it('treats an entry written with spaces or dashes as the same word', () => {
    expect(words(['cash app'], 'cashapp, cash app, cash-app')).toEqual(['cashapp', 'cash app', 'cash-app']);
    expect(words(['meet up'], "let's meetup")).toEqual(['meetup']);
  });

  it('matches part of a word where the entry has a *', () => {
    expect(words(['pay*'], 'payment payday repay')).toEqual(['payment', 'payday']);
    expect(words(['*gram'], 'telegram or instagram, gram')).toEqual(['telegram', 'instagram', 'gram']);
  });

  it('works for words in any alphabet', () => {
    expect(words(['встреча'], 'Встреча завтра? Не встречался')).toEqual(['Встреча']);
  });

  it('reports overlapping hits once', () => {
    const find = restrictedMatcher(['snap', 'snapchat*']);
    expect(find('add my snapchat')).toEqual([{ start: 7, end: 15, word: 'snapchat*' }]);
  });

  it('ignores blank entries and treats regex characters literally', () => {
    expect(restrictedMatcher(['', '  ', '*'])('anything')).toEqual([]);
    expect(words(['c.o.d', '$$$', 'a+b'], 'cod, $$$ and a+b')).toEqual(['cod', '$$$', 'a+b']);
  });
});

describe('splitWords', () => {
  it('reads a typed, pasted or exported list', () => {
    expect(splitWords('paypal, cash app;venmo\n\n "telegram"\r\nmeet up\t')).toEqual(['paypal', 'cash app', 'venmo', 'telegram', 'meet up']);
    expect(splitWords(' , \n')).toEqual([]);
  });
});

describe('wordMatcher', () => {
  const find = wordMatcher({ block: ['telegram', '@*'], allow: ['@jessrose', '@jessrose_vip'] });
  const found = (text: string) => find(text).map((m) => text.slice(m.start, m.end));

  it('leaves allowed words alone, even under a * entry', () => {
    expect(found('follow @jessrose and @jessrose_vip, not @someone')).toEqual(['@someone']);
  });

  it('still catches the rest', () => {
    expect(found('add me on t3legram')).toEqual(['t3legram']);
  });
});

describe('rulesFor', () => {
  const settings = { customWords: ['pink panda'], allowedWords: ['@me'], allowedOn: { fansly: ['hr'] } };

  it('holds back the creator’s words and the built-in list', () => {
    const rules = rulesFor(settings, 'onlyfans');
    expect(rules.block).toContain('pink panda');
    expect(rules.block).toEqual(expect.arrayContaining(BUILT_IN));
  });

  it('allows words everywhere, or on one site only', () => {
    expect(rulesFor(settings, 'onlyfans').allow).toEqual(['@me']);
    expect(rulesFor(settings, 'fansly').allow).toEqual(['@me', 'hr']);
    const find = (platform: 'onlyfans' | 'fansly') => wordMatcher(rulesFor(settings, platform))('back in an hr').map((m) => m.word);
    expect(find('onlyfans')).toEqual(['hr']);
    expect(find('fansly')).toEqual([]);
  });

  it('keeps the built-in list in A to Z order without repeats', () => {
    expect(new Set(BUILT_IN.map((w) => w.toLowerCase())).size).toBe(BUILT_IN.length);
    const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
    const order = (a: string, b: string) => compare(a.toLowerCase(), b.toLowerCase()) || compare(a, b);
    expect([...BUILT_IN].sort(order)).toEqual(BUILT_IN);
  });
});
