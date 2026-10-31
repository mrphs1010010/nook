import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import type { NookMessage } from '@/lib/messages';
import type { ChatListItem } from '@/lib/page';
import { type Chat, fanKey } from '@/lib/platforms';
import { SPENDER, WHALE, formatMoney, spentOf } from '@/lib/spending';
import { BULK_PAUSE, TAB_TIMEOUT } from '@/lib/statsFetcher';
import type { Fan } from '@/lib/store';
import { Avatar } from './Avatar';
import { ChevronDownIcon, RefreshIcon, SettingsIcon, SparkIcon } from './icons';

// The chats OnlyFans' own list shows right now, matched by fan ID with what Nook knows
// about each fan, so the spenders stand out. Nook can't mark them in the site's list, so
// the panel shows the same chats in the same order.

interface Row extends ChatListItem {
  key: string;
  spent: number | null; // null until their profile has been read
  gone: boolean; // their profile says the account is deleted or banned
  lists: string[];
}

function useRows(chats: ChatListItem[], fans: Fan[]): Row[] {
  return useMemo(() => {
    const byKey = new Map(fans.map((fan) => [fan.key, fan]));
    return chats.map((chat) => {
      const key = fanKey('onlyfans', chat.chatId);
      const stats = byKey.get(key)?.stats;
      return { ...chat, key, spent: spentOf(stats), gone: Boolean(stats?.missing), lists: stats?.lists ?? [] };
    });
  }, [chats, fans]);
}

// Opens a chat in the tab, the same as following a link to it (the page reloads).
const openChat = (tabId: number | null, chatId: string) => {
  if (tabId != null) browser.tabs.update(tabId, { url: `https://onlyfans.com/my/chats/chat/${chatId}/` }).catch(() => {});
};

// Looks up the spending of the fans on screen whose profile Nook hasn't read: their
// profiles open one at a time in background tabs, as when a chat is opened.
function useCheckSpending(rows: Row[]) {
  const [asked, setAsked] = useState<{ keys: string[]; until: number } | null>(null);
  const unchecked = rows.filter((row) => row.spent === null && !row.gone);

  useEffect(() => {
    if (!asked) return;
    const timer = setTimeout(() => setAsked(null), asked.until - Date.now());
    return () => clearTimeout(timer);
  }, [asked]);

  // Fans still waiting, as far as the rows on screen tell.
  const waiting = asked ? unchecked.filter((row) => asked.keys.includes(row.key)).length : 0;

  const check = async () => {
    if (!unchecked.length) return;
    const win = await browser.windows.getCurrent();
    for (const row of unchecked) {
      const chat: Chat = { platform: 'onlyfans', chatId: row.chatId, key: row.key };
      const url = `https://onlyfans.com/${row.username || `u${row.chatId}`}`;
      const message: NookMessage = { type: 'nook:fetch-stats', chat, url, windowId: win.id, bulk: true };
      browser.runtime.sendMessage(message).catch((error) => console.error('Nook: stats request failed', error));
    }
    setAsked({ keys: unchecked.map((row) => row.key), until: Date.now() + unchecked.length * (TAB_TIMEOUT + BULK_PAUSE) });
  };

  return { unchecked: unchecked.length, waiting, check };
}

function Spent({ value, gone }: { value: number | null; gone: boolean }) {
  if (value == null && gone) {
    return (
      <span className="spent none" title="OnlyFans says this profile isn’t available: deleted or banned">
        gone
      </span>
    );
  }
  if (value == null) return <span className="spent none">—</span>;
  const tier = value >= WHALE ? 'whale' : value >= SPENDER ? 'spender' : 'low';
  return <span className={`spent ${tier}`}>{formatMoney(value)}</span>;
}

const displayName = (row: Row) => row.name || `@${row.username}`;

// ---- The chat list page: the same chats, in the same order as on OnlyFans ----

type Filter = 'all' | 'unread' | 'spenders';

export function ChatsPage({ chats, fans, tabId, onSettings }: { chats: ChatListItem[]; fans: Fan[]; tabId: number | null; onSettings: () => void }) {
  const rows = useRows(chats, fans);
  const [filter, setFilter] = useState<Filter>('all');
  const { unchecked, waiting, check } = useCheckSpending(rows);
  const counts = {
    all: rows.length,
    unread: rows.filter((row) => row.unread).length,
    spenders: rows.filter((row) => (row.spent ?? 0) >= SPENDER).length,
  };
  const shown = rows.filter((row) => (filter === 'unread' ? row.unread : filter === 'spenders' ? (row.spent ?? 0) >= SPENDER : true));
  const labels: Record<Filter, string> = { all: 'All', unread: 'Unread', spenders: `$${SPENDER}+` };

  return (
    <>
      <header className="top-bar">
        <h1 className="top-title">
          Chats on screen <span className="count-pill">{rows.length}</span>
        </h1>
        <button className="icon-button" aria-label="Settings" title="Settings" onClick={onSettings}>
          <SettingsIcon />
        </button>
      </header>
      <div className="filters" role="group" aria-label="Show">
        {(Object.keys(labels) as Filter[]).map((f) => (
          <button key={f} className={filter === f ? 'filter active' : 'filter'} onClick={() => setFilter(f)}>
            {labels[f]} <span>{counts[f]}</span>
          </button>
        ))}
      </div>
      <main className="chats">
        <ul className="chat-list">
          {shown.map((row) => (
            <li key={row.chatId}>
              <button className="chat-row" title="Open this chat" onClick={() => openChat(tabId, row.chatId)}>
                <Avatar name={displayName(row)} seed={row.key} size={36} unread={row.unread} />
                <span className="chat-main">
                  <span className="chat-line">
                    <span className={row.unread ? 'chat-name unread' : 'chat-name'}>{displayName(row)}</span>
                    <span className="chat-time">{row.time}</span>
                  </span>
                  <span className={row.unread ? 'chat-last unread' : 'chat-last'}>{row.lastMessage}</span>
                </span>
                <span className="chat-side">
                  <Spent value={row.spent} gone={row.gone} />
                  {row.lists[0] ? (
                    <span className="tiny-chip">{row.lists[0]}</span>
                  ) : row.gone ? (
                    row.spent !== null && <span className="hint tiny">gone</span>
                  ) : (
                    row.spent === null && <span className="hint tiny">not checked</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!shown.length && <p className="empty-note">No chat on screen matches.</p>}
        <p className="hint tiny chats-more">Scroll the list on OnlyFans to see more here</p>
      </main>
      {(unchecked > 0 || waiting > 0) && (
        <footer className="dock bar">
          <span className="status">{waiting ? `Checking ${waiting}…` : `${unchecked} not checked yet`}</span>
          <button className="btn soft small" disabled={waiting > 0} onClick={check}>
            {waiting ? <span className="spinner" /> : <RefreshIcon size={14} />}
            Check spending
          </button>
        </footer>
      )}
    </>
  );
}

// ---- A chat is open: the fan and the chats on screen as two tabs ----

export type ChatTab = 'fan' | 'ai' | 'chats';

// The tabs over an open chat: the fan, the chat with AI about them, and (when OnlyFans shows
// its chat list) the chats on screen. `count` is null when there is no list.
export function ChatTabs({
  fanName,
  seed,
  count,
  tab,
  onChange,
}: {
  fanName: string;
  seed: string;
  count: number | null;
  tab: ChatTab;
  onChange: (tab: ChatTab) => void;
}) {
  return (
    <div className="chat-tabs">
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'fan'} onClick={() => onChange('fan')}>
          <Avatar name={fanName} seed={seed} size={18} />
          <span className="tab-name">{fanName}</span>
        </button>
        <button role="tab" aria-selected={tab === 'ai'} onClick={() => onChange('ai')}>
          <SparkIcon size={13} />
          AI
        </button>
        {count != null && (
          <button role="tab" aria-selected={tab === 'chats'} onClick={() => onChange('chats')}>
            On screen <span className="tab-count">{count}</span>
          </button>
        )}
      </div>
    </div>
  );
}

let lastSort: 'site' | 'spent' = 'site'; // kept while hopping between chats

export function OnScreen({
  chats,
  fans,
  tabId,
  openChatId,
  onShowFan,
}: {
  chats: ChatListItem[];
  fans: Fan[];
  tabId: number | null;
  openChatId: string;
  onShowFan: () => void;
}) {
  const rows = useRows(chats, fans);
  const [sort, setSortState] = useState(lastSort);
  const setSort = (next: typeof sort) => {
    lastSort = next;
    setSortState(next);
  };
  const { unchecked, waiting, check } = useCheckSpending(rows);
  const sorted = sort === 'spent' ? [...rows].sort((a, b) => (b.spent ?? -1) - (a.spent ?? -1)) : rows;

  return (
    <main className="chats">
      <div className="chats-sub">
        <span className="hint tiny">Visible in the OnlyFans list</span>
        <button className="sort" title="Change the order" onClick={() => setSort(sort === 'site' ? 'spent' : 'site')}>
          {sort === 'site' ? 'As on OnlyFans' : 'Most spent first'}
          <ChevronDownIcon />
        </button>
      </div>
      <ul className="chat-list">
        {sorted.map((row) => {
          const current = row.chatId === openChatId;
          return (
            <li key={row.chatId}>
              <button
                className={current ? 'chat-row compact current' : 'chat-row compact'}
                title={current ? 'Show this fan' : 'Open this chat'}
                onClick={() => (current ? onShowFan() : openChat(tabId, row.chatId))}
              >
                <Avatar name={displayName(row)} seed={row.key} size={28} unread={row.unread && !current} />
                <span className="chat-line chat-main">
                  <span className={row.unread && !current ? 'chat-name unread' : 'chat-name'}>{displayName(row)}</span>
                  {current ? <span className="chat-open">open</span> : <span className="chat-time">{row.time}</span>}
                </span>
                {row.lists[0] && <span className="tiny-chip">{row.lists[0]}</span>}
                <span className="chat-amount">
                  <Spent value={row.spent} gone={row.gone} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {(unchecked > 0 || waiting > 0) && (
        <p className="hint chats-note">
          {waiting ? (
            `Checking spending for ${waiting}…`
          ) : (
            <>
              {unchecked} not checked yet ·{' '}
              <button className="link accent" onClick={check}>
                Check spending
              </button>
            </>
          )}
        </p>
      )}
    </main>
  );
}
