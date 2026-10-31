import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney, spentOf } from '@/lib/spending';

describe('parseMoney', () => {
  it('reads amounts the way the sites write them', () => {
    expect(parseMoney('$1,204.50')).toBe(1204.5);
    expect(parseMoney('$4')).toBe(4);
    expect(parseMoney('$1.2K')).toBe(1200);
    expect(parseMoney('none')).toBeNull();
  });
});

describe('spentOf', () => {
  const stats = (items: { label: string; value: string }[]) => ({ items, fetchedAt: 1 });

  it('takes the Spent line of the profile', () => {
    expect(spentOf(stats([{ label: 'subscribed for', value: '3 months' }, { label: 'Spent', value: '$1,204.50' }]))).toBe(1204.5);
  });

  it('tells a profile not read yet from one that shows no spending', () => {
    expect(spentOf(undefined)).toBeNull();
    expect(spentOf(stats([{ label: 'subscribed for', value: '3 months' }]))).toBe(0);
  });

  it('knows nothing of a profile that was gone before it was read, but keeps what was read before', () => {
    expect(spentOf({ items: [], missing: true, fetchedAt: 1 })).toBeNull();
    expect(spentOf({ items: [{ label: 'Spent', value: '$40' }], missing: true, fetchedAt: 1 })).toBe(40);
  });
});

describe('formatMoney', () => {
  it('rounds down to whole dollars with separators', () => {
    expect(formatMoney(1204.5)).toBe('$1,204');
    expect(formatMoney(0)).toBe('$0');
  });
});
