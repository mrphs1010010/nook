import { describe, expect, it } from 'vitest';
import { isPlatformId, parseChat, platformForUrl } from '@/lib/platforms';

describe('parseChat', () => {
  it('recognises an OnlyFans chat', () => {
    const expected = { platform: 'onlyfans', chatId: '123456789', key: 'onlyfans:123456789' };
    expect(parseChat('https://onlyfans.com/my/chats/chat/123456789/')).toEqual(expected);
    expect(parseChat('https://onlyfans.com/my/chats/chat/123456789')).toEqual(expected);
    expect(parseChat('https://onlyfans.com/my/chats/chat/123456789/?tab=media#x')).toEqual(expected);
    expect(parseChat('https://www.onlyfans.com/my/chats/chat/123456789/')).toEqual(expected);
  });

  it('recognises a Fansly chat', () => {
    expect(parseChat('https://fansly.com/messages/512345678901234567')).toEqual({
      platform: 'fansly',
      chatId: '512345678901234567',
      key: 'fansly:512345678901234567',
    });
  });

  it.each([
    'https://onlyfans.com/my/chats/',
    'https://onlyfans.com/my/chats/chat/',
    'https://onlyfans.com/my/chats/chat/abc/',
    'https://onlyfans.com/my/chats/chat/123abc/',
    'https://onlyfans.com/someuser',
    'https://fansly.com/messages',
    'https://fansly.com/someuser/posts',
  ])('ignores %s, which is not a single chat', (url) => {
    expect(parseChat(url)).toBeNull();
  });

  it.each([
    'https://example.com/my/chats/chat/123/',
    'https://onlyfans.com.evil.io/my/chats/chat/123/',
    'https://notonlyfans.com/my/chats/chat/123/',
    'http://onlyfans.com/my/chats/chat/123/',
    'chrome://extensions',
    '',
    'not a url',
  ])('ignores %s, which is another site', (url) => {
    expect(parseChat(url)).toBeNull();
  });
});

describe('platformForUrl', () => {
  it('knows which site a page is on', () => {
    expect(platformForUrl('https://onlyfans.com/my/notifications')).toBe('onlyfans');
    expect(platformForUrl('https://fansly.com/home')).toBe('fansly');
    expect(platformForUrl('https://example.com/')).toBeNull();
  });
});

describe('isPlatformId', () => {
  it('accepts only real platforms, not inherited object keys', () => {
    expect(isPlatformId('onlyfans')).toBe(true);
    expect(isPlatformId('constructor')).toBe(false);
    expect(isPlatformId('toString')).toBe(false);
    expect(isPlatformId(1)).toBe(false);
  });
});
