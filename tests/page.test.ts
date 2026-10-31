// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isMissingProfile, isOnScreen, readChatList, readFan, readFanslyEarnings, readFanStats, readThread } from '@/lib/page';

// Trimmed copies of the real markup, with made-up names. Each also contains the creator's
// own profile elsewhere on the page, which must not be mistaken for the fan.
const ONLYFANS = `
  <div class="l-sidebar">
    <div class="b-username-row"><a href="/creator_self" class="g-user-realname__wrapper">
      <div class="g-user-username"> @creator_self </div></a></div>
  </div>
  <div class="g-page__header b-chat__header mb-0 b-header-conversation">
    <button class="g-page__header__btn"></button>
    <div class="b-chat__header__wrapper">
      <div class="b-chat__header__title g-text-ellipsis">
        <h1 at-attr="page_title" class="g-page-title m-chat-title">
          <div class="b-username-row m-width-limit">
            <a href="/fan_handle" class="g-user-name g-user-realname__wrapper m-nowrap-text"><span class="g-user-name"> Fan
              Name </span><!----></a>
            <button type="button" at-attr="name_edit" aria-label="Edit"></button>
          </div>
        </h1>
      </div>
      <div class="b-chat__subheader">
        <div class="b-chat__user-status"> Seen <span title="Oct 30, 7:08 am"> Yesterday </span></div>
        <a href="/my/chats/chat/123/pinned" aria-label="No pinned messages"></a>
      </div>
    </div>
  </div>`;

const FANSLY = `
  <app-nav-bar-top><app-account-info>
    <app-account-username><a class="username-wrapper" href="/creator_self"><span class="display-name">Creator</span></a></app-account-username>
  </app-account-info></app-nav-bar-top>
  <app-messages-conversation-route>
    <div class="message-content-header border-color"><div class="flex-col"><div class="flex-row">
      <div class="message-content-header-avatar"><app-account-avatar><a href="/fan_handle"></a></app-account-avatar></div>
      <div class="message-content-header-contact">
        <app-account-username><a class="username-wrapper" href="/fan_handle">
          <div class="icon-wrapper flex-row"><span appaccountcard="" class="display-name">Fan Name</span></div>
          <span class="user-name"><div class="dropdown-list">
            <div class="dropdown-item"> Edit User Notes </div><div class="dropdown-item"> Block user </div>
          </div></span>
        </a></app-account-username>
        <div class="content-header-sub-row"><div class="active-status">Last seen</div></div>
      </div>
    </div></div></div>
  </app-messages-conversation-route>`;

const page = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('readFan', () => {
  it('reads the fan from an OnlyFans chat header', () => {
    expect(readFan(page(ONLYFANS), 'onlyfans.com')).toEqual({ name: 'Fan Name', username: 'fan_handle' });
  });

  it('reads the fan from a Fansly conversation header', () => {
    expect(readFan(page(FANSLY), 'fansly.com')).toEqual({ name: 'Fan Name', username: 'fan_handle' });
  });

  it('returns nothing when no chat is open', () => {
    const sidebarOnly = page(ONLYFANS.slice(0, ONLYFANS.indexOf('<div class="g-page__header')));
    expect(readFan(sidebarOnly, 'onlyfans.com')).toEqual({ name: '', username: '' });
    expect(readFan(page('<app-nav-bar-top></app-nav-bar-top>'), 'fansly.com')).toEqual({ name: '', username: '' });
  });

  it('ignores other sites', () => {
    expect(readFan(page(ONLYFANS), 'example.com')).toEqual({ name: '', username: '' });
  });
});

// A fan's OnlyFans profile as the creator sees it. On wide screens "Fan statistics" sits in
// the right column, on narrow ones inside the main column; the block itself is the same.
const FAN_STATS = `
  <div class="b-profile__content__item m-active">
    <button type="button" class="b-section-title m-row m-collapsible"> Fan statistics </button>
    <div class="b-tab-container-fans"><ul class="b-fans__item__list m-fan-stats">
      <li class="b-fans__item__list__item"><span class="b-fans__item__list__label"> subscribed for </span><span> 3 months </span></li>
      <li class="b-fans__item__list__item"><span class="b-fans__item__list__label"> Spent </span> $1,204.50 </li>
      <li class="b-fans__item__list__item"><span class="g-btn m-flat m-link"> More info </span></li>
    </ul></div>
  </div>`;

// The creator's lists the fan is on, shown over the profile's cover.
const LISTS = `
  <div class="b-profile__header m-shadow-top"><img alt="Fan Name" class="b-profile__header__cover-img">
    <div class="b-list-titles m-over-img mb-0"><div class="b-dragscroll">
      <a href="/my/collections/user-lists/1000000001" class="g-btn m-flat b-dot-item"><span class="b-list-titles__item__text"> 🚨 chatting now </span></a>
      <a href="/my/collections/user-lists/1000000002" class="g-btn m-flat b-dot-item"><span class="b-list-titles__item__text"> FREE page </span></a>
    </div></div>
  </div>`;

const profile = (layout: 'wide' | 'narrow', lists = LISTS) => `
  <div class="l-sidebar"><a href="/creator_self"><div class="g-user-username"> @creator_self </div></a></div>
  <div class="l-wrapper${layout === 'narrow' ? ' m-content-one-column' : ''}"><div class="l-wrapper__content">${lists}
    <div class="b-profile__user d-flex">
      <a href="/u400000001" class="g-avatar"><div class="g-avatar__placeholder"> Fa </div></a>
      <div class="b-group-profile-btns">
        <a href="/my/chats/chat/400000001/" class="g-btn" aria-label="Message"></a>
      </div>
      <div class="b-profile__names"><div class="g-user-name"> Fan Name </div><span class="g-user-username"> @u400000001 </span></div>
    </div>
    <div class="b-profile-section-btns">${layout === 'narrow' ? FAN_STATS : ''}</div>
  </div>
  ${layout === 'wide' ? `<div class="l-wrapper__sidebar">${FAN_STATS}</div>` : ''}</div>`;

describe('readFanStats', () => {
  const expected = {
    platform: 'onlyfans',
    chatId: '400000001',
    items: [
      { label: 'subscribed for', value: '3 months' },
      { label: 'Spent', value: '$1,204.50' },
    ],
    lists: ['🚨 chatting now', 'FREE page'],
  };

  it('reads "Fan statistics" from a profile in a wide window', () => {
    expect(readFanStats(page(profile('wide')))).toEqual(expected);
  });

  it('reads the same block in a narrow window', () => {
    expect(readFanStats(page(profile('narrow')))).toEqual(expected);
  });

  it('reads a fan on no lists as such', () => {
    expect(readFanStats(page(profile('wide', '')))?.lists).toEqual([]);
  });

  it('ignores pages without the block, such as the subscription history in a chat', () => {
    const subscriptionHistory = `
      <div class="b-fans__item__header"><a href="/u400000001" class="b-username"></a></div>
      <div class="b-fans__item__list">
        <div class="b-fans__item__list__item"><span class="b-fans__item__list__label"> Started </span><span>Apr 18, 2026</span></div>
      </div>`;
    expect(readFanStats(page(subscriptionHistory))).toBeNull();
    expect(readFanStats(page(ONLYFANS))).toBeNull();
  });

  it('needs the profile to point at a chat, so stats are never filed under the wrong fan', () => {
    expect(readFanStats(page(profile('wide').replace('/my/chats/chat/400000001/', '/my/chats/')))).toBeNull();
  });
});

// A Fansly chat with the "Supporter" window open (⋯ → Earnings), trimmed, with made-up names.
const fanslyEarnings = ({ modalFan = 'fan_handle', period = 'Lifetime' } = {}) => `
  ${FANSLY}
  <div class="modal-wrapper"><app-stats-fan-detail-modal class="active-modal"><div class="modal v2 creator-dashboard-modal">
    <div class="modal-header"><div class="title">Supporter</div></div>
    <div class="modal-body">
      <app-growth-period-selector><div role="group" class="segmented">
        ${['7 days', '30 days', '90 days', 'Lifetime', 'Custom']
          .map((p) => `<button type="button" class="segment${p === period ? ' active' : ''}" aria-pressed="${p === period}">${p}</button>`)
          .join('')}
      </div><div class="period-caption"><span class="period-range"> Jun 25, 2019 – Oct 31 </span></div></app-growth-period-selector>
      <div class="fan-top"><div class="fan-identity">
        <app-account-username><a class="username-wrapper" href="/${modalFan}"><span class="display-name">Fan Name</span>
          <span class="user-name">@${modalFan}</span></a></app-account-username>
      </div></div>
      <div class="fan-metrics">
        <div class="metric primary"><div class="metric-value"><app-balance-display><i class="fal fa-dollar-sign"></i>85.40</app-balance-display></div><div class="metric-label">Earned</div></div>
        <div class="metric"><div class="metric-value"><app-balance-display><i class="fal fa-dollar-sign"></i>106.75</app-balance-display></div><div class="metric-label">Gross</div></div>
        <div class="metric"><div class="metric-value">7</div><div class="metric-label">purchases</div></div>
      </div>
      <div class="detail-section"><div class="detail-section-title">Monthly statements</div></div>
    </div>
  </div></app-stats-fan-detail-modal></div>`;

describe('readFanslyEarnings', () => {
  const chatUrl = 'https://fansly.com/messages/900000000000000001';

  it('reads the Supporter window opened over the fan’s chat', () => {
    expect(readFanslyEarnings(page(fanslyEarnings()), chatUrl)).toEqual({
      platform: 'fansly',
      chatId: '900000000000000001',
      period: 'Lifetime',
      items: [
        { label: 'Earned', value: '$85.40' },
        { label: 'Gross', value: '$106.75' },
        { label: 'purchases', value: '7' },
      ],
    });
  });

  it('notes which period the numbers cover', () => {
    expect(readFanslyEarnings(page(fanslyEarnings({ period: '30 days' })), chatUrl)?.period).toBe('30 days');
  });

  it('ignores a window about someone other than the chat’s fan', () => {
    expect(readFanslyEarnings(page(fanslyEarnings({ modalFan: 'someone_else' })), chatUrl)).toBeNull();
  });

  it('ignores the window outside a chat, and a chat without it', () => {
    expect(readFanslyEarnings(page(fanslyEarnings()), 'https://fansly.com/creator/stats/earnings')).toBeNull();
    expect(readFanslyEarnings(page(FANSLY), chatUrl)).toBeNull();
  });
});

// OnlyFans' chat list: recycled views in any DOM order, each knowing its place, plus one
// parked view the list isn't using.
const chatRow = (index: number, id: string, extra: string, body: string, y = index * 80) => `
  <div class="vue-recycle-scroller__item-view" style="transform: translateY(${y}px);"><div data-index="${index}">
    <div class="swipeout"><div class="swipeout-content">
      <div id="${id}" role="link" tabindex="0" class="b-available-users__item b-chats__item m-with-rectangle-hover ${extra}">
        <div class="b-available-users__round-img"><a href="/u${id}" class="g-avatar"><div class="g-avatar__placeholder"> Fa </div></a></div>
        <button type="button" class="b-chats__item__btn-clear" aria-label="Clear messages"></button>
        <a href="/my/chats/chat/${id}/" class="b-chats__item__link">
          ${body}
        </a>
      </div>
    </div></div>
  </div></div>`;
const user = (name: string, username: string) =>
  `<div class="b-chats__item__user b-username-row"><div class="b-username m-flex"><span at-attr="chat_list_user_name" class="g-user-name m-md-size">${name}</span><span class="g-user-username m-md-size"> @${username} </span></div></div>`;
const CHAT_LIST = `
  <div class="vue-recycle-scroller ready direction-vertical"><div class="vue-recycle-scroller__item-wrapper">
    ${chatRow(1, '222', 'm-place-for-media', `${user('Second Fan', 'second_fan')}
      <div class="b-chats__item__body"><div class="b-chats__item__last-message g-gray-text">
        <div class="b-chats__item__last-message__icons"><div class="b-chats__item__last-message__icon">
          <span class="b-chats__item__icon" aria-label="Media"><svg></svg></span></div></div>
        <div class="b-chats__item__last-message__content g-text-ellipsis"><span class="b-chats__item__media-label">Look what I made </span></div>
      </div><div class="b-chats__item__time"><span title="Apr 19, 9:47 am"> Apr 19 </span></div></div>`)}
    ${chatRow(0, '111', 'm-muted m-unread m-place-for-media', `${user('First Fan', 'u111')}
      <div class="b-chats__item__body"><div class="b-chats__item__last-message">
        <div class="b-chats__item__last-message__icons"><div class="b-chats__item__last-message__icon">
          <span class="b-chats__item__icon" aria-label="Tip"><svg></svg></span>
          <span class="b-chats__item__last-message__icon-value"> $5 </span></div></div>
        <div class="b-chats__item__last-message__content g-text-ellipsis"><span class="b-chats__item__last-message__text">thank
          you </span></div>
      </div><div class="b-chats__item__time"><span title="Jul 22, 10:05 pm"> Jul 22 </span></div></div>`)}
    ${chatRow(2, '333', 'm-place-for-media', `${user('Media Only', 'media_only')}
      <div class="b-chats__item__body"><div class="b-chats__item__last-message">
        <div class="b-chats__item__last-message__icons"><div class="b-chats__item__last-message__icon">
          <span class="b-chats__item__icon" aria-label="Media"><svg></svg></span></div></div>
        <div class="b-chats__item__last-message__content g-text-ellipsis"></div>
      </div><div class="b-chats__item__time"><span title="Oct 3, 1:42 am"> Oct 3 </span></div></div>`)}
    ${chatRow(7, '777', 'm-place-for-media', user('Parked', 'parked'), -9999)}
  </div></div>`;

describe('readChatList', () => {
  it('lists the chats in the order the list shows them, skipping parked views', () => {
    document.body.innerHTML = CHAT_LIST;
    expect(readChatList(document)).toEqual([
      { chatId: '111', name: 'First Fan', username: 'u111', lastMessage: 'Tip $5 · thank you', time: 'Jul 22', unread: true },
      { chatId: '222', name: 'Second Fan', username: 'second_fan', lastMessage: 'Look what I made', time: 'Apr 19', unread: false },
      { chatId: '333', name: 'Media Only', username: 'media_only', lastMessage: 'Media', time: 'Oct 3', unread: false },
    ]);
  });

  it('lists only the rows it is asked to, and nothing when none is left', () => {
    document.body.innerHTML = CHAT_LIST;
    expect(readChatList(document, (row) => row.id !== '111')?.map((c) => c.chatId)).toEqual(['222', '333']);
    expect(readChatList(document, () => false)).toBeNull();
  });

  it('finds nothing on pages without the list', () => {
    document.body.innerHTML = ONLYFANS;
    expect(readChatList(document)).toBeNull();
  });
});

describe('isOnScreen', () => {
  const place = (id: string, top: number, height: number) => {
    const el = document.getElementById(id)!;
    el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) });
  };

  it('counts rows at least half inside the scrolling box around them', () => {
    document.body.innerHTML = `
      <div id="box" style="overflow-y: auto"><div id="list">
        <div id="above"></div><div id="half"></div><div id="inside"></div><div id="peeking"></div>
      </div></div>`;
    place('box', 100, 300); // 100–400
    place('list', -200, 900); // taller than the box, scrolled
    place('above', 20, 80);
    place('half', 60, 80);
    place('inside', 200, 80);
    place('peeking', 380, 80);
    expect(['above', 'half', 'inside', 'peeking'].filter((id) => isOnScreen(document.getElementById(id)!))).toEqual(['half', 'inside']);
  });

  it('leaves out rows with no size, such as a hidden list', () => {
    document.body.innerHTML = '<div id="row"></div>';
    place('row', 10, 0);
    expect(isOnScreen(document.getElementById('row')!)).toBe(false);
  });
});


// Trimmed from the sites' markup; names and words made up.
const ONLYFANS_THREAD = `
<div class="b-chat__messages-wrapper">
  <div class="b-chat__item-message">
    <div class="b-chat__message__system m-timeline"><div class="b-chat__messages__time"><span title="Oct 28, 9:40 pm"> Oct 28 </span></div></div>
    <div class="b-chat__message m-from-me m-has-media m-video">
      <div class="b-chat__message__content"><div class="b-chat__message__body">
        <div class="b-chat__message__media-wrapper"><span class="b-chat__message__price"> $25 </span></div>
      </div></div>
      <span class="b-chat__message__time"><span> 9:40 pm </span></span>
    </div>
  </div>
  <div class="b-chat__item-message">
    <div class="b-chat__message__system m-timeline"><div class="b-chat__messages__time"><span> Today </span></div></div>
    <div class="b-chat__message m-text">
      <div class="b-chat__message__content"><a href="/miket" class="g-avatar"></a><div class="b-chat__message__body">
        <div class="b-chat__message__text"><div class="b-chat__message__text-holder"><p> send me the beach set   again </p><p>please 😍</p></div></div>
      </div></div>
      <span class="b-chat__message__time"><span> 9:52 am </span></span>
    </div>
    <div class="b-chat__message m-from-me m-text">
      <div class="b-chat__message__text"><p>haha <a href="/miket">@miket</a> maybe</p></div>
    </div>
  </div>
</div>`;

const FANSLY_THREAD = `
<app-messages-conversation-route>
  <div class="message-collection-wrapper">
    <app-group-message-collection class="message-collection">
      <app-group-message class="message my-message first-in-group last-in-group">
        <div class="message-wrapper"><div class="message"><div class="message-text">hey you</div></div></div>
      </app-group-message>
      <div class="timestamp my-message"><span class="margin-right-text">Oct 21, 5:03 PM</span><span class="blue-1"></span></div>
    </app-group-message-collection>
    <app-group-message-collection class="message-collection">
      <app-group-message class="message first-in-group"><div class="message"><div class="message-text">❤️</div></div></app-group-message>
      <app-group-message class="message last-in-group">
        <div class="message-attachments"><app-group-message-attachment></app-group-message-attachment></div>
        <div class="message-text-wrapper no-text"></div>
      </app-group-message>
      <div class="timestamp"><span>Oct 22, 2:06 AM</span></div>
    </app-group-message-collection>
  </div>
</app-messages-conversation-route>`;

describe('readThread', () => {
  it('reads an OnlyFans chat oldest first, with who wrote, media and time', () => {
    document.body.innerHTML = ONLYFANS_THREAD;
    expect(readThread(document, 'onlyfans.com')).toEqual([
      { from: 'me', text: '', media: 'video, $25', time: 'Oct 28, 9:40 pm' },
      { from: 'fan', text: 'send me the beach set again\nplease 😍', time: 'Today, 9:52 am' },
      { from: 'me', text: 'haha @miket maybe', time: 'Today' },
    ]);
  });

  it('reads a Fansly chat, each group of messages with its time', () => {
    document.body.innerHTML = FANSLY_THREAD;
    expect(readThread(document, 'fansly.com')).toEqual([
      { from: 'me', text: 'hey you', time: 'Oct 21, 5:03 PM' },
      { from: 'fan', text: '❤️', time: 'Oct 22, 2:06 AM' },
      { from: 'fan', text: '', media: 'media', time: 'Oct 22, 2:06 AM' },
    ]);
  });

  it('keeps the latest 40 messages', () => {
    document.body.innerHTML = `<div class="b-chat__messages-wrapper">${'<div class="b-chat__message"><div class="b-chat__message__text">hi</div></div>'.repeat(45)}</div>`;
    expect(readThread(document, 'onlyfans.com')).toHaveLength(40);
  });

  it('finds nothing when no chat is open', () => {
    document.body.innerHTML = CHAT_LIST;
    expect(readThread(document, 'onlyfans.com')).toBeNull();
    expect(readThread(document, 'example.com')).toBeNull();
  });
});

describe('isMissingProfile', () => {
  const GONE = `<div class="b-404"><h1>Sorry</h1><h2>this page is not available</h2>
    <p>The link you followed may be broken, or the page may have been removed.</p><a href="/">Go back to OnlyFans.com</a></div>`;

  it('knows OnlyFans’ page for a gone account at a profile address', () => {
    document.body.innerHTML = GONE;
    expect(isMissingProfile(document, '/someone')).toBe(true);
    expect(isMissingProfile(document, '/someone/')).toBe(true);
  });

  it('looks only at profile addresses, and only for that page', () => {
    document.body.innerHTML = GONE;
    expect(isMissingProfile(document, '/my/chats/chat/1/')).toBe(false);
    expect(isMissingProfile(document, '/my/chats')).toBe(false);
    document.body.innerHTML = '<h1>Mike T</h1>';
    expect(isMissingProfile(document, '/miket')).toBe(false);
  });
});
