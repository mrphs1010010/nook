// The message box at the bottom of a chat: reading what the creator is typing, and refusing
// to send it while it holds a restricted word. Nothing on the page is changed or clicked:
// the guard only swallows the Enter key or the click on Send before the site sees them,
// and the text stays in the box for the creator to fix.

import { type PlatformId, platformForUrl } from './platforms';

export interface Composer {
  box: string; // the message form, holding both of the below
  input: string;
  send: string;
}

// When a site changes its markup, this table is the only thing to update.
const COMPOSERS: Record<PlatformId, Composer> = {
  // <form id="make_post_form"> … <div contenteditable="true" class="tiptap ProseMirror …"><p>…</p></div>
  //   … <button type="button" at-attr="send_btn" class="g-btn m-rounded b-chat__btn-submit"> Send </button>
  // The same form without that button is the post editor, which is left alone.
  onlyfans: {
    box: 'form#make_post_form',
    input: '.ProseMirror[contenteditable="true"]',
    send: 'button[at-attr="send_btn"]',
  },
  // <app-group-message-input> … <textarea aria-label="Message" class="message-input"> …
  //   <button type="button" aria-label="Send message" class="send-button">
  fansly: {
    box: 'app-group-message-input',
    input: 'textarea.message-input',
    send: 'button.send-button',
  },
};

export function composerFor(url: string): Composer | null {
  const platform = platformForUrl(url);
  return platform ? COMPOSERS[platform] : null;
}

// The chat's message input, or null when the page has none.
export function findInput(doc: Document, composer: Composer): Element | null {
  for (const box of doc.querySelectorAll(composer.box)) {
    const input = box.querySelector(composer.input);
    if (input && box.querySelector(composer.send)) return input;
  }
  return null;
}

// The text as the creator typed it, one line per paragraph.
export function inputText(input: Element): string {
  if (input.tagName === 'TEXTAREA') return (input as HTMLTextAreaElement).value;
  // ProseMirror: a <p> per paragraph, <br> for Shift+Enter, plus a <br> of its own at the end.
  const blocks = input.children.length ? [...input.children] : [input];
  return blocks.map(nodeText).join('\n');
}

function nodeText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const element = node as Element;
  if (element.tagName === 'BR') return element.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
  if (element.tagName === 'IMG') return element.getAttribute('alt') ?? ''; // emoji drawn as images
  return [...element.childNodes].map(nodeText).join('');
}

// Puts text into the message box the way pasting does: through the browser's own editing
// command, so the site's editor takes it in like typing and ⌘Z there undoes it. Replaces
// what is in the box, or goes where the cursor is. Returns whether the box took it.
export function insertText(doc: Document, composer: Composer, text: string, replace: boolean): boolean {
  const input = findInput(doc, composer) as HTMLElement | null;
  if (!input) return false;
  input.focus();
  if (replace) {
    if (input.tagName === 'TEXTAREA') (input as HTMLTextAreaElement).select();
    else doc.execCommand('selectAll'); // with the editor focused, this selects only its text
  }
  return doc.execCommand('insertText', false, text);
}

const closest = (target: EventTarget | null, selector: string) => (target as Element | null)?.closest?.(selector) ?? null;

// Swallows Enter in the message box, and presses on Send, whenever `shouldBlock` says the
// text must not go out. It listens on the window in the capture phase, so it runs before any
// handler of the site. Returns a function that takes the guard down.
export function guardSending(
  win: Window,
  composer: Composer,
  shouldBlock: (text: string) => boolean,
  onBlocked: (text: string) => void,
): () => void {
  const stop = (event: Event, input: Element | null | undefined, report: boolean) => {
    if (!input) return;
    const text = inputText(input);
    if (!shouldBlock(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (report) onBlocked(text);
  };

  // Shift+Enter is a new line, and Enter while composing (IME) picks a candidate.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    const input = closest(event.target, composer.input);
    if (input?.closest(composer.box)?.querySelector(composer.send)) stop(event, input, event.type === 'keydown');
  };
  const onPress = (event: Event) => {
    const send = closest(event.target, composer.send);
    stop(event, send?.closest(composer.box)?.querySelector(composer.input), event.type === 'click');
  };

  // A site may send on keyup or keypress rather than keydown, and on the button going down or
  // up rather than on the click, so all of them are held back.
  const keys = ['keydown', 'keypress', 'keyup'] as const;
  const presses = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'] as const;
  const options = { capture: true, passive: false }; // touch listeners on the window are passive unless told
  for (const type of keys) win.addEventListener(type, onKey, true);
  for (const type of presses) win.addEventListener(type, onPress, options);
  return () => {
    for (const type of keys) win.removeEventListener(type, onKey, true);
    for (const type of presses) win.removeEventListener(type, onPress, options);
  };
}
