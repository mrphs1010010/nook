import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { parseChat } from '@/lib/platforms';
import { getFan, updateFan } from '@/lib/store';

// The fetcher keeps its queue in module state, so each test gets a fresh copy.
let fetcher: typeof import('@/lib/statsFetcher');

const chatOf = (id: string) => parseChat(`https://onlyfans.com/my/chats/chat/${id}/`)!;
const jobFor = (id: string) => ({ chat: chatOf(id), url: `https://onlyfans.com/u${id}` });
// URLs of open tabs, leaving out the fake browser's initial blank one.
const openTabs = async () => (await browser.tabs.query({})).flatMap((tab) => (tab.url ? [tab.url] : []));
const stats = (chatId: string, spent: string, lists: string[] = []) => ({
  platform: 'onlyfans' as const,
  chatId,
  items: [{ label: 'Spent', value: spent }],
  lists,
});
const fanslyStats = (period: string, gross: string) => ({
  platform: 'fansly' as const,
  chatId: '900000000000000001',
  period,
  items: [{ label: 'Gross', value: gross }],
});

beforeEach(async () => {
  fakeBrowser.reset();
  vi.resetModules();
  fetcher = await import('@/lib/statsFetcher');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('requestStats', () => {
  it('opens the profile in a background tab and closes it once the stats arrive', async () => {
    await fetcher.requestStats(jobFor('1'));
    const [tab] = await browser.tabs.query({ url: 'https://onlyfans.com/u1' });
    expect(tab).toMatchObject({ url: 'https://onlyfans.com/u1', active: false });

    await fetcher.receiveStats(stats('1', '$4', ['VIP']), tab!.id);
    expect((await getFan('onlyfans:1'))?.stats).toMatchObject({ items: [{ label: 'Spent', value: '$4' }], lists: ['VIP'] });
    expect(await openTabs()).not.toContain('https://onlyfans.com/u1');
  });

  it('skips fans looked up in the last 3 hours', async () => {
    await updateFan(chatOf('1'), (fan) => {
      fan.stats = { items: [], fetchedAt: Date.now() - 60 * 60 * 1000 };
    });
    await fetcher.requestStats(jobFor('1'));
    expect(await openTabs()).not.toContain('https://onlyfans.com/u1');
  });

  it('looks a fan up again once their stats are older than 3 hours', async () => {
    await updateFan(chatOf('1'), (fan) => {
      fan.stats = { items: [], fetchedAt: Date.now() - fetcher.STATS_MAX_AGE - 1 };
    });
    await fetcher.requestStats(jobFor('1'));
    expect(await openTabs()).toContain('https://onlyfans.com/u1');
  });

  it('ignores Fansly, which has no such block', async () => {
    const chat = parseChat('https://fansly.com/messages/512345678901234567')!;
    await fetcher.requestStats({ chat, url: 'https://fansly.com/someone' });
    expect(await openTabs()).toEqual([]);
  });

  it('opens one profile at a time, and only the latest waiting request runs next', async () => {
    await fetcher.requestStats(jobFor('1'));
    await fetcher.requestStats(jobFor('2'));
    await fetcher.requestStats(jobFor('3'));
    expect(await openTabs()).toEqual(['https://onlyfans.com/u1']);

    const [first] = await browser.tabs.query({ url: 'https://onlyfans.com/u1' });
    await fetcher.receiveStats(stats('1', '$4'), first!.id);
    await vi.waitFor(async () => expect(await openTabs()).toContain('https://onlyfans.com/u3'));
    expect(await openTabs()).not.toContain('https://onlyfans.com/u2');
  });

  it('works through fans asked for in bulk one by one, a pause apart, after the chat the creator opened', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const bulk = (id: string) => ({ ...jobFor(id), bulk: true });
    await fetcher.requestStats(bulk('1'));
    await fetcher.requestStats(bulk('2'));
    await fetcher.requestStats(bulk('3'));
    await fetcher.requestStats(jobFor('9')); // opened by the creator meanwhile: goes first
    await updateFan(chatOf('2'), (fan) => {
      fan.stats = { items: [], fetchedAt: Date.now() }; // looked up meanwhile: skipped
    });
    expect(await openTabs()).toEqual(['https://onlyfans.com/u1']);

    const close = async (id: string) => {
      const [tab] = await browser.tabs.query({ url: `https://onlyfans.com/u${id}` });
      await fetcher.receiveStats(stats(id, '$1'), tab!.id);
    };
    await close('1');
    await vi.waitFor(async () => expect(await openTabs()).toEqual(['https://onlyfans.com/u9']));
    await close('9');
    expect(await openTabs()).toEqual([]); // the pause
    await vi.advanceTimersByTimeAsync(2 * fetcher.BULK_PAUSE);
    await vi.waitFor(async () => expect(await openTabs()).toEqual(['https://onlyfans.com/u3']));
  });

  it('gives up on a profile that never shows the block', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await fetcher.requestStats(jobFor('1'));
    expect(await openTabs()).toContain('https://onlyfans.com/u1');
    await vi.advanceTimersByTimeAsync(fetcher.TAB_TIMEOUT);
    await vi.waitFor(async () => expect(await openTabs()).not.toContain('https://onlyfans.com/u1'));
  });
});

describe('profileMissing', () => {
  it('marks a fan whose profile is gone, keeps what was read before, and moves on', async () => {
    await updateFan(chatOf('1'), (fan) => {
      fan.stats = { items: [{ label: 'Spent', value: '$40' }], fetchedAt: Date.now() - fetcher.STATS_MAX_AGE - 1 };
    });
    await fetcher.requestStats(jobFor('1'));
    await fetcher.requestStats(jobFor('2'));
    const [tab] = await browser.tabs.query({ url: 'https://onlyfans.com/u1' });

    await fetcher.profileMissing(tab!.id);
    expect((await getFan('onlyfans:1'))?.stats).toMatchObject({ items: [{ label: 'Spent', value: '$40' }], missing: true });
    expect(await openTabs()).not.toContain('https://onlyfans.com/u1');
    expect(await openTabs()).toContain('https://onlyfans.com/u2');
  });

  it('ignores a gone profile the creator opened themselves', async () => {
    await fetcher.requestStats(jobFor('1'));
    const own = await browser.tabs.create({ url: 'https://onlyfans.com/somebody' });
    await fetcher.profileMissing(own.id);
    expect(await getFan('onlyfans:1')).toBeNull();
    expect(await openTabs()).toContain('https://onlyfans.com/u1');
  });
});

describe('receiveStats', () => {
  it('saves stats from a profile the creator opened themselves, without touching their tab', async () => {
    const tab = await browser.tabs.create({ url: 'https://onlyfans.com/u7', active: true });
    await fetcher.receiveStats(stats('7', '$90'), tab.id);
    expect((await getFan('onlyfans:7'))?.stats?.items[0]?.value).toBe('$90');
    expect(await openTabs()).toContain('https://onlyfans.com/u7');
  });

  it('files Fansly earnings under the chat, with their period', async () => {
    await fetcher.receiveStats(fanslyStats('Lifetime', '$106.75'), undefined);
    expect((await getFan('fansly:900000000000000001'))?.stats).toMatchObject({
      period: 'Lifetime',
      items: [{ label: 'Gross', value: '$106.75' }],
    });
  });

  it('keeps Lifetime numbers when a shorter period is opened later', async () => {
    await fetcher.receiveStats(fanslyStats('Lifetime', '$106.75'), undefined);
    await fetcher.receiveStats(fanslyStats('7 days', '$5'), undefined);
    expect((await getFan('fansly:900000000000000001'))?.stats?.items[0]?.value).toBe('$106.75');

    await fetcher.receiveStats(fanslyStats('Lifetime', '$120'), undefined);
    expect((await getFan('fansly:900000000000000001'))?.stats?.items[0]?.value).toBe('$120');
  });
});
