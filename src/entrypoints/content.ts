// Reads what OnlyFans / Fansly already show on screen and hands it to the extension:
// the fan of the open chat, a fan's spending wherever the site shows it (an OnlyFans
// profile, Fansly's Earnings window), the chats in OnlyFans' chat list, the messages of the
// open chat, and what the creator is typing to them. It never
// changes the page, never clicks anything and never calls the sites' APIs. It does two
// things beyond reading: it holds back sending a message that contains a restricted word,
// and when the creator asks, it puts a template or AI text into the message box.

import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { composerFor, findInput, guardSending, inputText, insertText } from '@/lib/composer';
import type { Draft, NookMessage, PageInfo } from '@/lib/messages';
import { isMissingProfile, isOnScreen, isReadableSite, readChatList, readFan, readFanslyEarnings, readFanStats, readThread } from '@/lib/page';
import { platformForUrl } from '@/lib/platforms';
import { wordMatcher } from '@/lib/restricted';
import { type Settings, getSettings, onSettingsChanged } from '@/lib/store';
import { rulesFor } from '@/lib/wordLists';

export default defineContentScript({
  matches: ['https://onlyfans.com/*', 'https://fansly.com/*'],
  runAt: 'document_idle',

  main(ctx) {
    const composer = composerFor(location.href);
    if (!isReadableSite(location.hostname) || !composer) return;

    const platform = platformForUrl(location.href) ?? 'onlyfans';
    let findRestricted = wordMatcher({ block: [], allow: [] });
    let holdBack = true;
    const onlyFans = location.hostname.endsWith('onlyfans.com');
    const snapshot = (): PageInfo => ({ url: location.href, ...readFan(document, location.hostname) });
    const chatList = () => (onlyFans ? readChatList(document, isOnScreen) : null);
    const thread = () => readThread(document, location.hostname);
    const draft = (text?: string): Draft => {
      const input = findInput(document, composer);
      text ??= input ? inputText(input) : '';
      return { url: location.href, inputFound: input !== null, text, matches: findRestricted(text) };
    };

    browser.runtime.onMessage.addListener((message: NookMessage, _sender, sendResponse) => {
      if (message?.type === 'nook:get-page') sendResponse(snapshot());
      if (message?.type === 'nook:get-draft') sendResponse(draft());
      if (message?.type === 'nook:get-chat-list') sendResponse(chatList());
      if (message?.type === 'nook:get-thread') sendResponse(thread());
      if (message?.type === 'nook:insert') sendResponse(insertText(document, composer, message.text, message.replace));
    });

    // The sites are single-page apps: watch the DOM and report when what we read changes,
    // at most every 400 ms so a busy chat doesn't flood the extension.
    const last = { page: '', stats: '', draft: '', chats: '', thread: '', missing: '' };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let draftTimer: ReturnType<typeof setTimeout> | undefined;

    const send = (kind: keyof typeof last, message: NookMessage, json: string) => {
      if (json === last[kind]) return;
      last[kind] = json;
      browser.runtime.sendMessage(message).catch(() => {}); // nobody is listening
    };

    const reportDraft = () => {
      draftTimer = undefined;
      if (ctx.isInvalid) return;
      const current = draft();
      send('draft', { type: 'nook:draft', draft: current }, JSON.stringify(current));
    };

    const report = () => {
      timer = undefined;
      if (ctx.isInvalid) return;
      const info = snapshot();
      send('page', { type: 'nook:page', info }, JSON.stringify(info));
      const stats = onlyFans ? readFanStats(document) : readFanslyEarnings(document, location.href);
      if (stats) send('stats', { type: 'nook:fan-stats', stats }, JSON.stringify(stats));
      else if (onlyFans && isMissingProfile(document, location.pathname)) send('missing', { type: 'nook:profile-missing' }, location.href);
      const chats = chatList();
      send('chats', { type: 'nook:chat-list', chats }, JSON.stringify(chats));
      const lines = thread();
      send('thread', { type: 'nook:thread', thread: lines }, JSON.stringify(lines));
      reportDraft();
    };

    const observer = new MutationObserver(() => {
      timer ??= setTimeout(report, 400);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    // Scrolling changes which chats of the list are on screen, often without changing the page.
    const onScroll = () => {
      timer ??= setTimeout(report, 150);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);

    // Typing shows up in the panel sooner than other changes.
    const onInput = () => {
      draftTimer ??= setTimeout(reportDraft, 120);
    };
    document.addEventListener('input', onInput, true);

    const removeGuard = guardSending(
      window,
      composer,
      (text) => holdBack && findRestricted(text).length > 0,
      (text) => {
        const message: NookMessage = { type: 'nook:send-blocked', draft: draft(text) };
        browser.runtime.sendMessage(message).catch(() => {});
      },
    );

    const useWords = (settings: Settings) => {
      if (ctx.isInvalid) return;
      findRestricted = wordMatcher(rulesFor(settings, platform));
      holdBack = settings.holdBack;
      reportDraft();
    };
    getSettings().then(useWords);
    const stopWatchingSettings = onSettingsChanged(useWords);

    // The extension was reloaded or updated: this copy of the script is orphaned.
    ctx.onInvalidated(() => {
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(draftTimer);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      removeGuard();
      stopWatchingSettings();
    });

    report();
  },
});
