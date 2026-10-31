// Messages between the content script, the side panel and the background worker.

import type { ChatLine, ChatListItem } from './page';
import type { Chat, PlatformId } from './platforms';
import type { Match } from './restricted';

// What the page itself shows about the fan of the open chat.
export interface PageInfo {
  url: string;
  name: string;
  username: string; // without "@"
}

// What a site shows the creator about a fan's spending: OnlyFans' "Fan statistics" on the
// profile (Spent → $4), or Fansly's "Supporter" earnings window (Gross → $12).
export interface FanStats {
  platform: PlatformId;
  chatId: string;
  items: { label: string; value: string }[];
  period?: string; // the period the numbers cover, when the site lets you pick one
  lists?: string[]; // the creator's lists the fan is on, where the site shows them (OnlyFans profiles)
}

// What is typed in the chat's message box right now.
export interface Draft {
  url: string;
  inputFound: boolean; // false when the box can't be found (the site changed its markup): nothing is guarded
  text: string;
  matches: Match[]; // restricted words in the text
}

export type NookMessage =
  | { type: 'nook:get-page' } // panel → content script, answered with PageInfo
  | { type: 'nook:page'; info: PageInfo } // content script → panel, whenever it changes
  | { type: 'nook:fan-stats'; stats: FanStats } // content script → background, from a fan profile
  | { type: 'nook:profile-missing' } // content script → background, from a profile that says the account is gone
  | { type: 'nook:fetch-stats'; chat: Chat; url: string; windowId?: number; bulk?: boolean } // panel → background
  | { type: 'nook:get-chat-list' } // panel → content script, answered with ChatListItem[] | null
  | { type: 'nook:chat-list'; chats: ChatListItem[] | null } // content script → panel, whenever it changes
  | { type: 'nook:get-thread' } // panel → content script, answered with ChatLine[] | null
  | { type: 'nook:thread'; thread: ChatLine[] | null } // content script → panel, whenever it changes
  | { type: 'nook:get-draft' } // panel → content script, answered with Draft
  | { type: 'nook:draft'; draft: Draft } // content script → panel and background, as the creator types
  | { type: 'nook:send-blocked'; draft: Draft } // content script → panel, when a message was held back
  | { type: 'nook:insert'; text: string; replace: boolean }; // panel → content script, answered with whether it worked
