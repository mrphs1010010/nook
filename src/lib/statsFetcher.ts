// Keeps a fan's spending fresh by opening their OnlyFans profile in a background tab — the
// same as a person looking them up — and letting the content script read "Fan statistics"
// there. Nothing is clicked and no API is called.

import { browser } from 'wxt/browser';
import type { FanStats } from './messages';
import { type Chat, fanKey } from './platforms';
import { getFan, updateFan } from './store';

export const STATS_MAX_AGE = 3 * 60 * 60 * 1000; // look each fan up at most every 3 hours
export const TAB_TIMEOUT = 20_000; // give up on a profile that never shows the block
const LIFETIME = 'Lifetime'; // the period on Fansly that matters; shorter ones never replace it

export const BULK_PAUSE = 5000; // between profiles of a "Check spending" batch, about as fast as clicking through by hand

export interface StatsJob {
  chat: Chat;
  url: string; // the fan's profile
  windowId?: number;
  bulk?: boolean; // one of many the creator asked for at once, from the chat list
}

interface Running {
  chat: Chat;
  key: string;
  tabId: number | null;
  timer: ReturnType<typeof setTimeout>;
}

// One profile tab at a time. While it loads, only the most recent chat the creator opened
// waits (flicking through chats shouldn't pile up tabs); fans asked for in bulk wait in
// line behind it, a short pause apart.
let running: Running | null = null;
let queued: StatsJob | null = null;
const backlog: StatsJob[] = [];

export async function requestStats(job: StatsJob): Promise<void> {
  if (job.chat.platform !== 'onlyfans') return;
  const fan = await getFan(job.chat.key);
  if (fan?.stats && Date.now() - fan.stats.fetchedAt < STATS_MAX_AGE) {
    if (!running) startNext(); // the line moves on past fans looked up in the meantime
    return;
  }
  if (running) {
    if (running.key === job.chat.key) return;
    if (!job.bulk) queued = job;
    else if (!backlog.some((j) => j.chat.key === job.chat.key)) backlog.push(job);
    return;
  }

  const current: Running = { chat: job.chat, key: job.chat.key, tabId: null, timer: setTimeout(() => finish(current), TAB_TIMEOUT) };
  running = current;
  try {
    const tab = await browser.tabs.create({ url: job.url, active: false, windowId: job.windowId });
    current.tabId = tab.id ?? null;
    if (running !== current) closeTab(current.tabId); // timed out while the tab was opening
  } catch (error) {
    console.error('Nook: could not open the profile', error);
    finish(current);
  }
}

// Spending read from a page: a profile Nook opened, a profile the creator opened themselves,
// or Fansly's Earnings window.
export async function receiveStats(stats: FanStats, tabId: number | undefined): Promise<void> {
  const { platform, chatId, items, period, lists } = stats;
  await updateFan({ platform, chatId, key: fanKey(platform, chatId) }, (fan) => {
    if (fan.stats?.period === LIFETIME && period !== LIFETIME) return false;
    fan.stats = { items, ...(period && { period }), ...(lists && { lists }), fetchedAt: Date.now() };
  });
  if (running && tabId != null && running.tabId === tabId) finish(running);
}

// The profile Nook opened says "this page is not available": the account is deleted or
// banned. The fan is marked so it isn't looked up again for a while; what was read before stays.
export async function profileMissing(tabId: number | undefined): Promise<void> {
  const job = running;
  if (!job || tabId == null || job.tabId !== tabId) return; // a page the creator opened themselves
  await updateFan(job.chat, (fan) => {
    fan.stats = { ...(fan.stats ?? { items: [] }), missing: true, fetchedAt: Date.now() };
  });
  finish(job);
}

// The profile tab was closed by someone else (the creator, or the browser).
export function tabClosed(tabId: number) {
  if (running?.tabId === tabId) {
    running.tabId = null;
    finish(running);
  }
}

function finish(job: Running) {
  if (running !== job) return;
  clearTimeout(job.timer);
  closeTab(job.tabId);
  running = null;
  startNext();
}

function startNext() {
  const next = queued ?? backlog.shift();
  queued = null;
  if (!next) return;
  const run = () => requestStats(next).catch((error) => console.error('Nook: stats request failed', error));
  if (next.bulk) setTimeout(run, BULK_PAUSE);
  else run();
}

function closeTab(tabId: number | null) {
  if (tabId != null) browser.tabs.remove(tabId).catch(() => {}); // already closed
}
