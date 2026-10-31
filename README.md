# Nook

A free, open-source Chrome extension for OnlyFans and Fansly creators. It sits in Chrome’s side panel next to your chats: notes on fans, what they’ve spent, a check for restricted words, templates, and optional AI.

It’s made for creators who don’t want to trade the safety of their account for features. Nook makes no requests of its own to the sites, adds nothing to their pages, and never sends anything for you.

[Website](docs/index.html) · [Install](#install) · [Русская версия](README.ru.md)

## What it does

- **Notes on fans.** A notepad per fan: each note is a line you can edit in place, of any length. Fans are told apart by the chat’s address, so notes stay with the right person even if they change their name.
- **Spending and lists.** What the fan has spent, how long they’ve been subscribed, and which of your lists they’re on. On OnlyFans, Nook opens the fan’s profile in a background tab, reads “Fan statistics” and closes it, at most every 3 hours per fan (or only when you press Look up). Fansly shows spending only in the chat’s Earnings window, so Nook saves it when you open that window yourself.
- **Chats on screen (OnlyFans).** On the chat list, the panel shows the chats you can see, in the same order, with what each fan has spent. “Check spending” looks up unknown fans one profile at a time, five seconds apart. Deleted accounts are marked and skipped.
- **Restricted words.** While your message has a restricted word, Enter and Send do nothing, the Nook icon turns red, and the panel shows the message with the words marked. A built-in list of 900+ words that often get messages flagged, plus your own. Any word can be allowed everywhere or on one site only. Matching is by whole word and sees through disguises like p@yp4l, p.a.y.p.a.l and look-alike letters; `pay*` matches the start of a word.
- **Templates** with tags, favorites and search; `{name}` becomes the fan’s first name.
- **AI, on your own OpenRouter key (optional).** Spelling fixes shown word by word, Improve (three rewrites of your message), and an AI chat about the fan that sees what you allow: the messages loaded on the page, the fan’s spending and lists, and the last ten turns. Notes are never sent.
- **Insert or copy.** Insert puts text in the site’s message box the way pasting does. You always press Send.
- **Your data stays in your browser.** Export a backup and import it on another computer. The AI key and AI chats stay out of backups.

## How it stays out of the way

- **No requests of its own.** Nook never calls the sites’ APIs and never intercepts requests or tokens. It reads what’s already shown in your tab.
- **Nothing added to the page.** No buttons, badges or styles on the site. Everything is in Chrome’s side panel.
- **No automation.** No auto-replies, no mass messages, no clicks for you. The only things it does on the page: hold back Enter and Send while a restricted word is in your message, and type into the message box when you press Insert.
- **No server, no account, no analytics.** The only place it ever talks to is OpenRouter, and only when you use AI.

Permissions: `onlyfans.com` and `fansly.com` (to read the chat you have open), `sidePanel`, `storage` and `clipboardWrite`.

Nook is an unofficial tool. No tool can promise how a platform will judge it; read the sites’ terms and decide for yourself.

## Install

Nook isn’t in the Chrome Web Store yet.

1. [Download `nook-chrome.zip`](../../releases/latest/download/nook-chrome.zip) from the latest release and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the unzipped folder.
3. Reload any OnlyFans or Fansly tabs you already had open.
4. Pin Nook, open a chat and click its icon. For AI, add your OpenRouter key in Settings.

Works in Chrome 116+ and other Chromium browsers with extension side panels.

## Develop

Built with [WXT](https://wxt.dev), React and TypeScript; tests run on Vitest. Needs Node 22 or newer.

```bash
npm install            # dependencies, and WXT's generated types
npm run dev            # Chrome with the extension and hot reload
npm run build          # the extension in output/chrome-mv3
npm run zip            # a zip of it for a release
npm run compile        # type check
npm test               # unit tests
npm run preview:panel  # the panel in a normal tab with a fake chrome.* API, at http://127.0.0.1:5178/
                       # ?ai=fake (made-up AI answers), ?theme=light|dark, ?url=<the tab's address>
```

When a site changes its pages, what Nook reads is kept in one table per site: `SITES` in `src/lib/page.ts` and `COMPOSERS` in `src/lib/composer.ts`.

```
src/
  entrypoints/
    background.ts     opens the panel, background profile tabs, the red mark on the icon
    content.ts        reads the page; holds back sending a restricted word; inserts text on request
    sidepanel/        the panel (React)
  lib/
    page.ts           what is read from the sites' pages
    composer.ts       the message box and the send guard
    restricted.ts     matching restricted words, with disguises and allowed words
    wordLists.ts      which words are checked on which site
    baseWords.ts      the built-in word list
    store.ts          fans and settings in storage.local, backups
    statsFetcher.ts   background tabs for OnlyFans spending
    ai.ts, aiChat.ts  OpenRouter: spelling, Improve, the AI chat and its memory
tests/                Vitest
docs/index.html       the website (one page, for GitHub Pages)
dev/chrome-mock.js    the fake chrome.* API for preview:panel
```

Issues and pull requests are welcome.

## License

[MIT](LICENSE). Nook is an independent project, not affiliated with or endorsed by OnlyFans or Fansly.
