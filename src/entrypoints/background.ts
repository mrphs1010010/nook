import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { NookMessage } from '@/lib/messages';
import { profileMissing, receiveStats, requestStats, tabClosed } from '@/lib/statsFetcher';

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

  browser.runtime.onMessage.addListener((message: NookMessage, sender) => {
    const failed = (error: unknown) => console.error('Nook: fan stats', error);
    if (message?.type === 'nook:fetch-stats') {
      requestStats({ chat: message.chat, url: message.url, windowId: message.windowId, bulk: message.bulk }).catch(failed);
    }
    if (message?.type === 'nook:fan-stats') receiveStats(message.stats, sender.tab?.id).catch(failed);
    if (message?.type === 'nook:profile-missing') profileMissing(sender.tab?.id).catch(failed);
    if (message?.type === 'nook:draft' && sender.tab?.id != null) warn(sender.tab.id, message.draft.matches.length > 0);
  });

  // Chrome adds Nook's page script only to pages loaded after Nook was installed or updated;
  // tabs open before that need a reload, which the panel offers.
  browser.tabs.onRemoved.addListener(tabClosed);
});

// A red mark on the toolbar icon while the message being typed in that tab has a restricted
// word, so it is noticed even with the panel closed.
function warn(tabId: number, on: boolean) {
  const done = (promise: Promise<void>) => promise.catch(() => {}); // the tab is gone
  done(browser.action.setBadgeText({ tabId, text: on ? '!' : '' }));
  done(browser.action.setBadgeBackgroundColor({ tabId, color: '#d93025' }));
  done(browser.action.setTitle({ tabId, title: on ? 'Nook: your message has a restricted word' : 'Open Nook' }));
}
