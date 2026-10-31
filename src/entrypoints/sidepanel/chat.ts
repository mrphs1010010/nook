// Getting text from the panel into the chat: typed into the message box by the content
// script when the creator allows it, else copied for them to paste.

import { browser } from 'wxt/browser';
import type { NookMessage } from '@/lib/messages';

export type Delivery = 'inserted' | 'copied' | 'failed';

export async function sendToChat(
  text: string,
  { tabId, insert, replace }: { tabId: number | null; insert: boolean; replace: boolean },
): Promise<Delivery> {
  if (insert && tabId != null) {
    try {
      const message: NookMessage = { type: 'nook:insert', text, replace };
      if (await browser.tabs.sendMessage(tabId, message)) return 'inserted';
    } catch {
      // No content script in this tab: copy instead.
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The clipboard API wants the panel focused; the older copy command doesn't.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position: fixed; opacity: 0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  }
}

export const isMac = navigator.platform.startsWith('Mac');

export const deliveryNote = (delivery: Delivery) =>
  delivery === 'copied'
    ? `Copied. Paste it in the chat with ${isMac ? '⌘V' : 'Ctrl+V'}.`
    : delivery === 'failed'
      ? 'Couldn’t copy the text.'
      : '';
