import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { type AiSettings, getAiSettings, onAiSettingsChanged } from '@/lib/ai';
import type { Draft, NookMessage, PageInfo } from '@/lib/messages';
import type { ChatLine, ChatListItem } from '@/lib/page';
import { type Chat, parseChat, platformForUrl } from '@/lib/platforms';
import {
  type Fan,
  type Settings,
  type Theme,
  getSettings,
  listFans,
  onFansChanged,
  onSettingsChanged,
  updateFan,
} from '@/lib/store';

export interface ActiveTab {
  id: number | null;
  url: string;
  chat: Chat | null; // set when the tab is an open chat
}

export type PageFan = Pick<PageInfo, 'name' | 'username'>;

const NO_TAB: ActiveTab = { id: null, url: '', chat: null };

// Follows the active tab of the panel's window: which chat is open, and what the
// page itself shows about that fan.
export function useActiveChat() {
  const [state, setState] = useState<{ tab: ActiveTab; page: PageFan | null }>({ tab: NO_TAB, page: null });

  useEffect(() => {
    let windowId: number | undefined;
    let current = NO_TAB;
    let refreshId = 0;
    let disposed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const applyPage = (tabId: number | undefined, info: PageInfo | undefined) => {
      if (!info || tabId !== current.id || parseChat(info.url)?.key !== current.chat?.key) return;
      const page = { name: info.name || '', username: info.username || '' };
      setState((s) => (s.page?.name === page.name && s.page?.username === page.username ? s : { ...s, page }));
    };

    // Right after switching chats the DOM can lag behind the URL, so ask again a moment later.
    const requestPage = (tabId: number) => {
      for (const delay of [0, 700]) {
        const timer = setTimeout(async () => {
          timers.delete(timer);
          try {
            const message: NookMessage = { type: 'nook:get-page' };
            applyPage(tabId, await browser.tabs.sendMessage(tabId, message));
          } catch {
            // No content script in this tab (it was open before Nook was installed) — the URL is enough.
          }
        }, delay);
        timers.add(timer);
      }
    };

    const refresh = async () => {
      const id = ++refreshId;
      const [active] = await browser.tabs.query({ active: true, windowId });
      if (disposed || id !== refreshId) return; // a newer refresh has started
      const url = active?.url ?? '';
      const next: ActiveTab = { id: active?.id ?? null, url, chat: parseChat(url) };
      const chatChanged = next.chat?.key !== current.chat?.key;
      current = next;
      setState((s) => ({ tab: next, page: chatChanged ? null : s.page }));
      if (next.chat && next.id != null) requestPage(next.id);
    };

    const onActivated = (info: { windowId: number }) => {
      if (info.windowId === windowId) refresh();
    };
    const onUpdated = (_tabId: number, change: { url?: string; status?: string }, tab: { active: boolean; windowId: number }) => {
      if (tab.active && tab.windowId === windowId && (change.url || change.status === 'complete')) refresh();
    };
    const onMessage = (message: NookMessage, sender: { tab?: { id?: number } }) => {
      if (message?.type === 'nook:page') applyPage(sender.tab?.id, message.info);
    };

    browser.windows.getCurrent().then((win) => {
      if (disposed) return;
      windowId = win.id;
      browser.tabs.onActivated.addListener(onActivated);
      browser.tabs.onUpdated.addListener(onUpdated);
      browser.runtime.onMessage.addListener(onMessage);
      refresh();
    });

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  return state;
}

// Every saved fan, kept in sync with storage.
export function useFans() {
  const [fans, setFans] = useState<Fan[]>([]);

  useEffect(() => {
    let loadId = 0;
    let disposed = false;
    const load = async () => {
      const id = ++loadId;
      const list = await listFans();
      if (!disposed && id === loadId) setFans(list);
    };
    const unsubscribe = onFansChanged(load);
    load();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return fans;
}

// Asks the background worker to look up the fan's OnlyFans profile for their spending
// (it skips fans looked up recently), unless the creator turned that off. Waits a moment
// first, so flicking through chats doesn't open a profile for each of them.
export function useStatsRequest(chat: Chat | null, username: string, enabled: boolean) {
  const key = chat?.key;

  useEffect(() => {
    if (!chat || chat.platform !== 'onlyfans' || !enabled) return;
    const timer = setTimeout(() => lookUpStats(chat, username), 1500);
    return () => clearTimeout(timer);
    // `chat` is identified by its key; a new object for the same chat must not restart the timer.
  }, [key, username, enabled]);
}

// Asks for the fan's OnlyFans profile to be read in a background tab (skipped if it was read
// in the last 3 hours).
export async function lookUpStats(chat: Chat, username: string) {
  const win = await browser.windows.getCurrent();
  const message: NookMessage = {
    type: 'nook:fetch-stats',
    chat,
    url: `https://onlyfans.com/${username || `u${chat.chatId}`}`,
    windowId: win.id,
  };
  browser.runtime.sendMessage(message).catch((error) => console.error('Nook: stats request failed', error));
}

// Keeps the saved name current when a fan renames themselves on the site. While switching
// chats the old header can linger next to the new URL, so only save a name that has
// stayed put for a moment.
export function useNameSync(chat: Chat | null, page: PageFan | null) {
  const key = chat?.key;
  const name = page?.name ?? '';
  const username = page?.username ?? '';

  useEffect(() => {
    if (!chat || !(name || username)) return;
    const timer = setTimeout(() => {
      updateFan(
        chat,
        (fan) => {
          const nextName = name || fan.name;
          const nextUsername = username || fan.username;
          if (nextName === fan.name && nextUsername === fan.username) return false;
          Object.assign(fan, { name: nextName, username: nextUsername });
        },
        { create: false },
      ).catch((error) => console.error('Nook: save failed', error));
    }, 1500);
    return () => clearTimeout(timer);
    // `chat` is identified by its key; a new object for the same chat must not restart the timer.
  }, [key, name, username]);
}

// What is typed in the active tab's message box, as its content script reports it.
// `blockedAt` is when sending it was last held back; it clears once the text changes.
// `missing` is set when the tab is on a supported site but Nook's script isn't running
// there (the tab couldn't take it when Nook was installed): only a reload brings it.
export function useDraft(tabId: number | null, url: string) {
  const [state, setState] = useState<{ draft: Draft | null; blockedAt: number; missing: boolean }>({
    draft: null,
    blockedAt: 0,
    missing: false,
  });
  const site = platformForUrl(url) !== null;

  useEffect(() => {
    setState({ draft: null, blockedAt: 0, missing: false });
    if (tabId == null || !site) return;
    let disposed = false;

    const apply = (draft: Draft | undefined, blocked = false) => {
      if (disposed || !draft) return;
      setState((s) => ({
        draft,
        blockedAt: blocked ? Date.now() : s.draft?.text === draft.text ? s.blockedAt : 0,
        missing: false,
      }));
    };
    const onMessage = (message: NookMessage, sender: { tab?: { id?: number } }) => {
      if (sender.tab?.id !== tabId) return;
      if (message?.type === 'nook:draft') apply(message.draft);
      if (message?.type === 'nook:send-blocked') apply(message.draft, true);
    };
    browser.runtime.onMessage.addListener(onMessage);

    // The content script only reports changes, so ask for the current text; again a moment
    // later in case the message box was still loading.
    const timers = [0, 700, 2000].map((delay, attempt, all) =>
      setTimeout(async () => {
        try {
          const message: NookMessage = { type: 'nook:get-draft' };
          apply(await browser.tabs.sendMessage(tabId, message));
        } catch {
          // No content script in this tab, or not yet: the page may still be loading.
          if (attempt === all.length - 1 && !disposed) setState((s) => (s.draft ? s : { ...s, missing: true }));
        }
      }, delay),
    );

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [tabId, url, site]);

  return state;
}

// The chats OnlyFans' chat list shows in the active tab right now, as its content script
// reports them; null where there is no list.
export function useChatList(tabId: number | null, url: string) {
  const [chats, setChats] = useState<ChatListItem[] | null>(null);
  const onlyFans = platformForUrl(url) === 'onlyfans';

  useEffect(() => {
    setChats(null);
    if (tabId == null || !onlyFans) return;
    let disposed = false;

    const apply = (list: ChatListItem[] | null | undefined) => {
      if (!disposed) setChats(list?.length ? list : null);
    };
    const onMessage = (message: NookMessage, sender: { tab?: { id?: number } }) => {
      if (sender.tab?.id === tabId && message?.type === 'nook:chat-list') apply(message.chats);
    };
    browser.runtime.onMessage.addListener(onMessage);

    // The content script only reports changes, so ask for the current list; again a moment
    // later in case the list was still loading.
    const timers = [0, 700].map((delay) =>
      setTimeout(async () => {
        try {
          const message: NookMessage = { type: 'nook:get-chat-list' };
          apply(await browser.tabs.sendMessage(tabId, message));
        } catch {
          // No content script in this tab.
        }
      }, delay),
    );

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [tabId, onlyFans]);

  return chats;
}

// The messages of the chat open in the tab, as the page shows them; null when no chat is open
// or Nook's script isn't in the tab.
export function useThread(tabId: number | null, url: string) {
  const [thread, setThread] = useState<ChatLine[] | null>(null);
  const supported = platformForUrl(url) !== null;

  useEffect(() => {
    setThread(null);
    if (tabId == null || !supported) return;
    let disposed = false;

    const apply = (lines: ChatLine[] | null | undefined) => {
      if (!disposed) setThread(lines ?? null);
    };
    const onMessage = (message: NookMessage, sender: { tab?: { id?: number } }) => {
      if (sender.tab?.id === tabId && message?.type === 'nook:thread') apply(message.thread);
    };
    browser.runtime.onMessage.addListener(onMessage);

    // The content script only reports changes, so ask for the current messages; again a
    // moment later in case the chat was still loading.
    const timers = [0, 700].map((delay) => setTimeout(async () => apply(await readThreadNow(tabId)), delay));

    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [tabId, url, supported]);

  return thread;
}

// The chat's messages as the page shows them right now, or null.
export async function readThreadNow(tabId: number | null): Promise<ChatLine[] | null> {
  if (tabId == null) return null;
  try {
    const message: NookMessage = { type: 'nook:get-thread' };
    return ((await browser.tabs.sendMessage(tabId, message)) as ChatLine[] | null) ?? null;
  } catch {
    return null; // no content script in this tab
  }
}

// The restricted words and templates, kept in sync with storage. Null while loading.
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let loadId = 0;
    let disposed = false;
    const load = async () => {
      const id = ++loadId;
      const loaded = await getSettings();
      if (!disposed && id === loadId) setSettings(loaded);
    };
    const unsubscribe = onSettingsChanged(load);
    load();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return settings;
}

// The OpenRouter key and model, kept in sync with storage. Null while loading.
export function useAiSettings() {
  const [ai, setAi] = useState<AiSettings | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      const loaded = await getAiSettings();
      if (!disposed) setAi(loaded);
    };
    const unsubscribe = onAiSettingsChanged(load);
    load();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return ai;
}

// "system" leaves the colors to the browser's light or dark mode; see style.css.
export function useTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}
