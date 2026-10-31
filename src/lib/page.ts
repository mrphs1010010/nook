// Reading what the sites already render: the fan of the open chat, and what each site
// shows about a fan's spending.

import type { FanStats } from './messages';
import { parseChat } from './platforms';

// Where each site shows the open chat's fan: the name, and a link to their profile
// ("/<username>"). When a site changes its markup, this table is the only thing to update.
const SITES: Record<string, { name: string; profileLink: string }> = {
  // <div class="b-chat__header"> … <h1><a href="/<username>" class="g-user-name …">
  //   <span class="g-user-name"> Name </span></a> …
  'onlyfans.com': {
    name: '.b-chat__header__title .g-user-name',
    profileLink: '.b-chat__header__title a[href^="/"]',
  },
  // <app-messages-conversation-route> … <div class="message-content-header-contact">
  //   <app-account-username><a class="username-wrapper" href="/<username>">
  //   <span class="display-name">Name</span> …
  'fansly.com': {
    name: 'app-messages-conversation-route .message-content-header-contact .display-name',
    profileLink: 'app-messages-conversation-route .message-content-header-contact a.username-wrapper[href^="/"]',
  },
};

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

// "/<username>" → "<username>"
const usernameFromHref = (href: string | null | undefined) => /^\/([A-Za-z0-9_.-]+)\/?$/.exec(href ?? '')?.[1] ?? '';

export const isReadableSite = (hostname: string) => Object.hasOwn(SITES, hostname.replace(/^www\./, ''));

export function readFan(doc: Document, hostname: string): { name: string; username: string } {
  const site = SITES[hostname.replace(/^www\./, '')];
  if (!site) return { name: '', username: '' };
  const name = clean(doc.querySelector(site.name)?.textContent);
  const username = usernameFromHref(doc.querySelector(site.profileLink)?.getAttribute('href'));
  return { name, username };
}

// The "Fan statistics" block of an OnlyFans fan profile, as the creator sees it:
//   <ul class="b-fans__item__list m-fan-stats">
//     <li><span class="b-fans__item__list__label"> Spent </span> $4 </li> …
// It sits in the right column on wide screens and in the main column on narrow ones,
// with the same markup. The profile's "Message" button links to the fan's chat. Over the
// cover, the profile also names the creator's lists the fan is on:
//   <div class="b-list-titles"> <a href="/my/collections/user-lists/<id>">
//     <span class="b-list-titles__item__text"> VIP </span></a> …
export function readFanStats(doc: Document): FanStats | null {
  const list = doc.querySelector('ul.m-fan-stats');
  const chatLink = doc.querySelector('.b-profile__user a[href^="/my/chats/chat/"]')?.getAttribute('href') ?? '';
  const chatId = /^\/my\/chats\/chat\/(\d+)/.exec(chatLink)?.[1];
  if (!list || !chatId) return null;

  const items = [...list.querySelectorAll('li')].flatMap((li) => {
    const labelEl = li.querySelector('.b-fans__item__list__label');
    if (!labelEl) return []; // the "More info" button
    const label = clean(labelEl.textContent);
    const value = clean([...li.childNodes].filter((node) => node !== labelEl).map((node) => node.textContent).join(' '));
    return label && value ? [{ label, value }] : [];
  });
  const lists = [...doc.querySelectorAll('.b-profile__header a[href^="/my/collections/user-lists/"]')]
    .map((link) => clean(link.querySelector('.b-list-titles__item__text')?.textContent ?? link.textContent))
    .filter(Boolean);
  return items.length ? { platform: 'onlyfans', chatId, items, lists } : null;
}

// Fansly's "Supporter" window, opened by the creator from a chat's ⋯ menu → Earnings:
//   <app-stats-fan-detail-modal> … <button class="segment active" aria-pressed="true">Lifetime</button>
//   <div class="fan-identity"><a class="username-wrapper" href="/<username>"> …
//   <div class="fan-metrics"><div class="metric"><div class="metric-value">
//     <app-balance-display><i class="fa-dollar-sign"></i>12</app-balance-display></div>
//     <div class="metric-label">Gross</div></div> …
// Read only while a chat is open and the window is about that chat's fan.
export function readFanslyEarnings(doc: Document, url: string): FanStats | null {
  const chat = parseChat(url);
  const modal = doc.querySelector('app-stats-fan-detail-modal');
  if (chat?.platform !== 'fansly' || !modal) return null;

  const modalFan = usernameFromHref(modal.querySelector('.fan-identity a.username-wrapper')?.getAttribute('href'));
  const chatFan = readFan(doc, 'fansly.com').username;
  if (!modalFan || modalFan.toLowerCase() !== chatFan.toLowerCase()) return null;

  const period = clean(modal.querySelector('.segmented .segment[aria-pressed="true"]')?.textContent);
  const items = [...modal.querySelectorAll('.fan-metrics .metric')].flatMap((metric) => {
    const label = clean(metric.querySelector('.metric-label')?.textContent);
    const valueEl = metric.querySelector('.metric-value');
    const value = clean(valueEl?.textContent);
    // Money is drawn as a dollar icon followed by the number.
    const money = valueEl?.querySelector('.fa-dollar-sign') && !value.startsWith('$');
    return label && value ? [{ label, value: money ? `$${value}` : value }] : [];
  });
  return items.length ? { platform: 'fansly', chatId: chat.chatId, items, ...(period && { period }) } : null;
}

// A row of OnlyFans' chat list, as the list shows it.
export interface ChatListItem {
  chatId: string; // the fan's user ID, as in the chat's URL
  name: string;
  username: string; // without "@"
  lastMessage: string;
  time: string; // as the list shows it: "2m", "Jul 22"
  unread: boolean;
}

const PARKED = /translateY\(\s*-\d{4,}/; // a recycled row the list isn't using right now

// OnlyFans' chat list: the /my/chats page, and the column beside an open chat on wide
// screens. It is a virtual list, so only the rows on screen (and a few past its edges)
// are in the page, each in a recycled view that knows its place in the list:
//   <div class="vue-recycle-scroller__item-view" style="transform: translateY(80px)">
//     <div data-index="1"> … <div id="<fan id>" class="b-chats__item m-unread …">
//       <a href="/my/chats/chat/<fan id>/"> <span class="g-user-name">Name</span>
//         <span class="g-user-username"> @username </span> …
//         <div class="b-chats__item__last-message__icon"><span aria-label="Tip"></span>
//           <span class="b-chats__item__last-message__icon-value"> $5 </span></div>
//         <div class="b-chats__item__last-message__content"><span>text</span></div>
//         <div class="b-chats__item__time"><span title="Jul 22, 10:05 pm"> Jul 22 </span></div> …
// Views the list isn't using are parked far above the top. `shown` picks the rows to list,
// such as the ones on screen. Null when no row is listed.
export function readChatList(doc: Document, shown: (row: Element) => boolean = () => true): ChatListItem[] | null {
  const rows = [...doc.querySelectorAll('.b-chats__item[id]')];
  const items = rows
    .flatMap((row) => {
      if (!/^\d+$/.test(row.id)) return [];
      const view = row.closest('.vue-recycle-scroller__item-view');
      if (PARKED.test(view?.getAttribute('style') ?? '') || !shown(row)) return [];
      const icons = [...row.querySelectorAll('.b-chats__item__last-message__icon')].map((icon) => ({
        label: icon.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '',
        value: clean(icon.querySelector('.b-chats__item__last-message__icon-value')?.textContent),
      }));
      const text = clean(row.querySelector('.b-chats__item__last-message__content')?.textContent);
      // "Tip $5" is worth showing next to the text; a bare "Media" only when there is no text.
      const lastMessage = [
        ...icons.filter((i) => i.value).map((i) => clean(`${i.label} ${i.value}`)),
        text || icons.map((i) => i.label).filter(Boolean).join(', '),
      ]
        .filter(Boolean)
        .join(' · ');
      const item: ChatListItem = {
        chatId: row.id,
        name: clean(row.querySelector('.g-user-name')?.textContent),
        username: clean(row.querySelector('.g-user-username')?.textContent).replace(/^@/, ''),
        lastMessage,
        time: clean(row.querySelector('.b-chats__item__time')?.textContent),
        unread: row.classList.contains('m-unread'),
      };
      return [{ item, index: Number(row.closest('[data-index]')?.getAttribute('data-index') ?? Infinity) }];
    })
    .sort((a, b) => a.index - b.index)
    .map(({ item }) => item);
  return items.length ? items : null;
}

const CLIPS = /^(auto|scroll|hidden|clip|overlay)$/; // overflow values that cut off what sticks out

// Whether at least half of an element is on screen: inside the window and inside every
// scrolling box around it. OnlyFans' list keeps a few rows ready past its edges, in the
// page but out of sight; this tells them apart.
export function isOnScreen(el: Element): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return true;
  const rect = el.getBoundingClientRect();
  if (!rect.height) return false;
  let top = Math.max(rect.top, 0);
  let bottom = Math.min(rect.bottom, win.innerHeight);
  for (let box = el.parentElement; box && bottom > top; box = box.parentElement) {
    if (!CLIPS.test(win.getComputedStyle(box).overflowY)) continue;
    const outer = box.getBoundingClientRect();
    top = Math.max(top, outer.top);
    bottom = Math.min(bottom, outer.bottom);
  }
  return bottom - top >= rect.height / 2;
}

// OnlyFans' page for an account that is gone (deleted or banned), at the profile's address:
//   Sorry / this page is not available / The link you followed may be broken, or the page
//   may have been removed. / Go back to OnlyFans.com
export function isMissingProfile(doc: Document, pathname: string): boolean {
  if (!/^\/(?!my\/)[^/]+\/?$/.test(pathname)) return false; // profiles are /<username>
  return /this page is not available/i.test(doc.body?.textContent ?? '');
}

// A message of the open chat, as the page shows it.
export interface ChatLine {
  from: 'fan' | 'me';
  text: string; // empty for media without a caption
  media?: string; // what the message carries besides text: "photo", "video", "media"
  time?: string; // as the page shows it
}

const THREAD_LIMIT = 40; // the latest messages are what matters; older ones only cost tokens
const MEDIA_KINDS = ['photo', 'video', 'audio', 'gif'];

// The messages of the open chat that the site has loaded, oldest first, at most the last 40.
// Scrolling up in the chat loads older ones. Null when no chat is open.
export function readThread(doc: Document, hostname: string): ChatLine[] | null {
  const site = hostname.replace(/^www\./, '');
  const lines = site === 'onlyfans.com' ? readOnlyFansThread(doc) : site === 'fansly.com' ? readFanslyThread(doc) : null;
  return lines && lines.filter((line) => line.text || line.media).slice(-THREAD_LIMIT);
}

// Paragraphs on their own lines, each with its spaces tidied.
const paragraphs = (el: Element | null) => {
  if (!el) return '';
  const blocks = [...el.querySelectorAll('p')];
  return (blocks.length ? blocks.map((p) => clean(p.textContent)) : [clean(el.textContent)]).filter(Boolean).join('\n');
};

// <div class="b-chat__messages-wrapper"> <div class="b-chat__item-message">
//   <div class="b-chat__message__system m-timeline"><div class="b-chat__messages__time"><span> Oct 19 </span>
//   <div class="b-chat__message m-from-me m-has-media m-photo m-text"> …
//     <div class="b-chat__message__text"> <p> text </p> … <span class="b-chat__message__time"> 9:47 pm </span>
// Messages without "m-from-me" are the fan's. Days are separators between the messages.
function readOnlyFansThread(doc: Document): ChatLine[] | null {
  const wrapper = doc.querySelector('.b-chat__messages-wrapper');
  if (!wrapper) return null;
  let day = '';
  return [...wrapper.querySelectorAll('.b-chat__messages__time, .b-chat__message')].flatMap((el): ChatLine[] => {
    if (el.classList.contains('b-chat__messages__time')) {
      day = clean(el.textContent);
      return [];
    }
    const kind = MEDIA_KINDS.find((k) => el.classList.contains(`m-${k}`)) ?? (el.classList.contains('m-has-media') ? 'media' : '');
    const price = clean(el.querySelector('[class*="price"]')?.textContent);
    const time = clean(el.querySelector('.b-chat__message__time')?.textContent);
    return [
      {
        from: el.classList.contains('m-from-me') ? 'me' : 'fan',
        text: paragraphs(el.querySelector('.b-chat__message__text')),
        ...(kind && { media: /\$\s*\d/.test(price) ? `${kind}, ${price}` : kind }),
        ...((day || time) && { time: [day, time].filter(Boolean).join(', ') }),
      },
    ];
  });
}

// <app-messages-conversation-route> … <app-group-message-collection class="message-collection">
//   <app-group-message class="message my-message …"> … <div class="message-text"> text </div>
//     <app-group-message-attachment> … </app-group-message> …
//   <div class="timestamp my-message"><span> Oct 21, 5:03 PM </span> …
// Messages without "my-message" are the fan's; a group of messages shares one time.
function readFanslyThread(doc: Document): ChatLine[] | null {
  const route = doc.querySelector('app-messages-conversation-route');
  if (!route) return null;
  return [...route.querySelectorAll('app-group-message-collection')].flatMap((group) => {
    const time = clean(group.querySelector('.timestamp span')?.textContent);
    return [...group.querySelectorAll('app-group-message')].map(
      (message): ChatLine => ({
        from: message.classList.contains('my-message') ? 'me' : 'fan',
        text: paragraphs(message.querySelector('.message-text')),
        ...(message.querySelector('app-group-message-attachment, .message-attachment') && { media: 'media' }),
        ...(time && { time }),
      }),
    );
  });
}
