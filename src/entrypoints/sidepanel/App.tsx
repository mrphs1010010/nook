import { useEffect, useState } from 'react';
import { PLATFORMS, platformForUrl } from '@/lib/platforms';
import type { Fan } from '@/lib/store';
import { AiChat } from './AiChat';
import { type ChatTab, ChatsPage, ChatTabs, OnScreen } from './ChatList';
import { Dock } from './Dock';
import { FanView } from './FanView';
import {
  useActiveChat,
  useAiSettings,
  useChatList,
  useDraft,
  useFans,
  useNameSync,
  useSettings,
  useStatsRequest,
  useTheme,
  useThread,
} from './hooks';
import { ChatIcon, SettingsIcon } from './icons';
import { AiContextPage, AiKeyPage, ModelPage, type Page, SettingsPage } from './Settings';
import { useWordCheck } from './words';
import { WordsSettings } from './WordsSettings';

export function App() {
  const { tab, page } = useActiveChat();
  const fans = useFans();
  const settings = useSettings();
  const ai = useAiSettings();
  const { draft, blockedAt, missing } = useDraft(tab.id, tab.url);
  const chats = useChatList(tab.id, tab.url);
  const thread = useThread(tab.id, tab.url);
  const [pages, setPages] = useState<Page[]>([]); // settings pages opened over the chat, last on top
  const [chatTab, setChatTab] = useState<ChatTab>('fan');
  const { chat } = tab;
  const fan = (chat && fans.find((f) => f.key === chat.key)) || null;
  // Opening another chat (say, from "On screen") shows that fan; the AI tab stays, as a way of working.
  useEffect(() => setChatTab((t) => (t === 'chats' ? 'fan' : t)), [chat?.key]);
  useNameSync(chat, page);
  useStatsRequest(chat, page?.username || fan?.username || '', settings?.autoSpending ?? false);
  useTheme(settings?.theme ?? 'system');

  // For {name} in templates and for AI: how the fan calls themselves on the site, first name only.
  const fanName = (page?.name || fan?.name || fan?.alias || '').trim().split(/\s+/)[0] ?? '';
  const card = fan ? fanCard(fan) : [];
  const platform = chat?.platform ?? platformForUrl(tab.url) ?? 'onlyfans';
  const check = useWordCheck(settings, platform);

  const open = (next: Page) => setPages((p) => [...p, next]);
  const back = () => setPages((p) => p.slice(0, -1));
  const current = pages.at(-1);

  if (current && settings) {
    return (
      <div className="app">
        {current === 'settings' && <SettingsPage settings={settings} ai={ai} onOpen={open} onBack={back} />}
        {current === 'words' && <WordsSettings settings={settings} platform={platform} onBack={back} />}
        {current === 'ai-key' && <AiKeyPage ai={ai} onBack={back} />}
        {current === 'ai-model' && <ModelPage ai={ai} onBack={back} />}
        {current === 'ai-context' && <AiContextPage settings={settings} fanName={chat ? fanName : ''} thread={thread} card={card} onBack={back} />}
      </div>
    );
  }

  // The chat list page of OnlyFans, with no chat open: the chats on screen and their spending.
  if (!chat && chats) {
    return (
      <div className="app">
        <ChatsPage chats={chats} fans={fans} tabId={tab.id} onSettings={() => open('settings')} />
      </div>
    );
  }

  const username = page?.username || fan?.username || '';
  // "On screen" falls back to the fan when the list leaves the screen.
  const view = !chat ? null : chatTab === 'chats' && !chats ? 'fan' : chatTab;
  return (
    <div className="app">
      {chat && (
        <ChatTabs
          fanName={fan?.alias || page?.name || fan?.name || (username ? `@${username}` : 'This fan')}
          seed={chat.key}
          count={chats?.length ?? null}
          tab={view ?? 'fan'}
          onChange={setChatTab}
        />
      )}
      {chat && chats && view === 'chats' ? (
        <OnScreen chats={chats} fans={fans} tabId={tab.id} openChatId={chat.chatId} onShowFan={() => setChatTab('fan')} />
      ) : chat && settings && view === 'ai' ? (
        <AiChat
          key={chat.key}
          fanKey={chat.key}
          fanName={fanName}
          card={card}
          tabId={tab.id}
          thread={thread}
          draft={draft?.text ?? ''}
          restricted={draft?.matches.length ?? 0}
          insert={settings.insertIntoChat && Boolean(draft?.inputFound)}
          missing={missing}
          settings={settings}
          check={check}
          ai={ai}
          onNeedKey={() => open('ai-key')}
          onShowContext={() => open('ai-context')}
          onShowFan={() => setChatTab('fan')}
        />
      ) : chat ? (
        <FanView key={chat.key} chat={chat} fan={fan} page={page} autoSpending={settings?.autoSpending ?? true} onSettings={() => open('settings')} />
      ) : (
        <EmptyState url={tab.url} onSettings={() => open('settings')} />
      )}
      {settings && view !== 'ai' && (
        <Dock
          tabId={tab.id}
          draft={draft}
          blockedAt={blockedAt}
          missing={missing}
          chatOpen={Boolean(chat)}
          settings={settings}
          check={check}
          ai={ai}
          fanName={chat ? fanName : ''}
          onNeedKey={() => open('ai-key')}
        />
      )}
    </div>
  );
}

// The fan's card, line by line, for AI: "Spent: $1,204.50", "Lists: Whales".
function fanCard(fan: Fan): string[] {
  const stats = fan.stats;
  if (!stats) return [];
  return [
    ...stats.items.map((item) => `${item.label}: ${item.value}${stats.period ? ` (${stats.period})` : ''}`),
    ...(stats.lists?.length ? [`Lists: ${stats.lists.join(', ')}`] : []),
  ];
}

function EmptyState({ url, onSettings }: { url: string; onSettings: () => void }) {
  const platform = platformForUrl(url);
  return (
    <>
      <header className="top-bar">
        <span className="logo">Nook</span>
        <button className="icon-button" aria-label="Settings" title="Settings" onClick={onSettings}>
          <SettingsIcon />
        </button>
      </header>
      <main className="empty">
        <span className="empty-icon">
          <ChatIcon />
        </span>
        <h2>{platform ? 'Open a conversation' : 'Open a chat'}</h2>
        <p>
          {platform
            ? `Pick a chat on ${PLATFORMS[platform].label} and the fan’s card shows up here.`
            : 'Nook follows the conversation on OnlyFans or Fansly: your notes on the fan, what they’ve spent, and a check of what you type.'}
        </p>
      </main>
    </>
  );
}
