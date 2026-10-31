// Supported sites and how to recognise an open chat from the tab URL.
// The chat ID in the URL is what ties a conversation to a fan record.

export type PlatformId = 'onlyfans' | 'fansly';

export const PLATFORMS: Record<PlatformId, { label: string; host: string; chatPath: RegExp }> = {
  onlyfans: {
    label: 'OnlyFans',
    host: 'onlyfans.com',
    // https://onlyfans.com/my/chats/chat/123456789/ — the ID is the fan's user ID.
    chatPath: /^\/my\/chats\/chat\/(\d+)(?:\/|$)/,
  },
  fansly: {
    label: 'Fansly',
    host: 'fansly.com',
    // https://fansly.com/messages/123456789012345678 — the ID is the conversation ID.
    chatPath: /^\/messages\/(\d+)(?:\/|$)/,
  },
};

export interface Chat {
  platform: PlatformId;
  chatId: string;
  key: string;
}

export const fanKey = (platform: PlatformId, chatId: string) => `${platform}:${chatId}`;

export const isPlatformId = (value: unknown): value is PlatformId =>
  typeof value === 'string' && Object.hasOwn(PLATFORMS, value);

function toUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// The platform of any page on a supported site, else null.
export function platformForUrl(url: string): PlatformId | null {
  const u = toUrl(url);
  if (!u || u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  for (const [id, platform] of Object.entries(PLATFORMS)) {
    if (host === platform.host) return id as PlatformId;
  }
  return null;
}

// The open chat when the URL is one, else null.
export function parseChat(url: string): Chat | null {
  const platform = platformForUrl(url);
  if (!platform) return null;
  const chatId = PLATFORMS[platform].chatPath.exec(new URL(url).pathname)?.[1];
  if (!chatId) return null;
  return { platform, chatId, key: fanKey(platform, chatId) };
}
