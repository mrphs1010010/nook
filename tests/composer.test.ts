// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { composerFor, findInput, guardSending, inputText, insertText } from '@/lib/composer';

// Trimmed copies of the real message boxes.
const ONLYFANS = `
  <form id="make_post_form" class="b-create-post-form">
    <div contenteditable="true" role="textbox" aria-label="Textbox field" class="tiptap ProseMirror b-text-editor">
      <p>hey <strong>you</strong></p><p>pay me on paypal<br>ok?<br class="ProseMirror-trailingBreak"></p>
    </div>
    <button type="button" at-attr="send_btn" class="g-btn m-rounded b-chat__btn-submit"> Send </button>
  </form>`;

const ONLYFANS_POST = `
  <form id="make_post_form"><div contenteditable="true" class="tiptap ProseMirror"><p>paypal</p></div>
    <button type="button" at-attr="submit_post">Post</button></form>`;

const FANSLY = `
  <app-group-message-input><div class="message-entry">
    <div class="message-input-container"><textarea aria-label="Message" rows="1" class="message-input"></textarea></div>
    <button type="button" aria-label="Send message" class="send-button"><app-icon><i class="fa-paper-plane-top"></i></app-icon></button>
  </div></app-group-message-input>`;

const onlyfans = composerFor('https://onlyfans.com/my/chats/chat/1/')!;
const fansly = composerFor('https://fansly.com/messages/1')!;

let removeGuard = () => {};
afterEach(() => {
  removeGuard();
  document.body.innerHTML = '';
});

describe('reading the message box', () => {
  it('reads the OnlyFans editor line by line', () => {
    document.body.innerHTML = ONLYFANS;
    expect(inputText(findInput(document, onlyfans)!)).toBe('hey you\npay me on paypal\nok?');
  });

  it('reads an empty OnlyFans editor as nothing', () => {
    document.body.innerHTML = ONLYFANS.replace(/<p>.*<\/p>/s, '<p><br class="ProseMirror-trailingBreak"></p>');
    expect(inputText(findInput(document, onlyfans)!)).toBe('');
  });

  it('reads the Fansly textarea', () => {
    document.body.innerHTML = FANSLY;
    const input = findInput(document, fansly) as HTMLTextAreaElement;
    input.value = 'hi\nthere';
    expect(inputText(input)).toBe('hi\nthere');
  });

  it('leaves the OnlyFans post editor alone', () => {
    document.body.innerHTML = ONLYFANS_POST;
    expect(findInput(document, onlyfans)).toBeNull();
  });
});

describe('guardSending', () => {
  // The site's own handlers, which must never see a blocked message.
  const siteSends = vi.fn();
  const blocked = vi.fn();
  const guard = (composer = onlyfans) => {
    removeGuard = guardSending(window, composer, (text) => text.includes('paypal'), blocked);
  };
  const press = (target: Element, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  afterEach(() => {
    siteSends.mockReset();
    blocked.mockReset();
  });

  it('holds back Enter while the text has a restricted word', () => {
    document.body.innerHTML = ONLYFANS;
    const input = findInput(document, onlyfans)!;
    input.addEventListener('keydown', siteSends);
    guard();

    expect(press(input).defaultPrevented).toBe(true);
    expect(siteSends).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledWith('hey you\npay me on paypal\nok?');
  });

  it('holds back every part of pressing Send, and reports it once', () => {
    document.body.innerHTML = FANSLY;
    (findInput(document, fansly) as HTMLTextAreaElement).value = 'my paypal';
    const button = document.querySelector('button.send-button')!;
    const types = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const type of types) button.addEventListener(type, siteSends);
    guard(fansly);

    for (const type of types) button.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    expect(siteSends).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledOnce();
  });

  it('holds back a click on Send, even on the icon inside it', () => {
    document.body.innerHTML = FANSLY;
    (findInput(document, fansly) as HTMLTextAreaElement).value = 'my paypal';
    const button = document.querySelector('button.send-button')!;
    button.addEventListener('click', siteSends);
    guard(fansly);

    button.querySelector('i')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(siteSends).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledOnce();
  });

  it('lets clean text, Shift+Enter and typing with an IME through', () => {
    document.body.innerHTML = FANSLY;
    const input = findInput(document, fansly) as HTMLTextAreaElement;
    input.addEventListener('keydown', siteSends);
    guard(fansly);

    input.value = 'see you soon';
    press(input);
    input.value = 'my paypal';
    press(input, { shiftKey: true });
    press(input, { isComposing: true });
    expect(siteSends).toHaveBeenCalledTimes(3);
    expect(blocked).not.toHaveBeenCalled();
  });

  it('stops guarding once taken down', () => {
    document.body.innerHTML = ONLYFANS;
    const input = findInput(document, onlyfans)!;
    input.addEventListener('keydown', siteSends);
    guard();
    removeGuard();

    press(input);
    expect(siteSends).toHaveBeenCalledOnce();
  });
});

describe('insertText', () => {
  // happy-dom has no editing commands, so record what would run.
  const commands: unknown[][] = [];
  const execCommand = (...args: unknown[]) => {
    commands.push(args);
    return true;
  };
  afterEach(() => {
    commands.length = 0;
  });

  it('replaces the text in the OnlyFans editor', () => {
    document.body.innerHTML = ONLYFANS;
    document.execCommand = execCommand as typeof document.execCommand;
    expect(insertText(document, onlyfans, 'Hey Jess', true)).toBe(true);
    expect(document.activeElement).toBe(findInput(document, onlyfans));
    expect(commands).toEqual([['selectAll'], ['insertText', false, 'Hey Jess']]);
  });

  it('types at the cursor in the Fansly textarea', () => {
    document.body.innerHTML = FANSLY;
    document.execCommand = execCommand as typeof document.execCommand;
    expect(insertText(document, fansly, 'Hey Jess', false)).toBe(true);
    expect(commands).toEqual([['insertText', false, 'Hey Jess']]);
  });

  it('does nothing without a message box', () => {
    document.body.innerHTML = ONLYFANS_POST;
    expect(insertText(document, onlyfans, 'Hey', true)).toBe(false);
  });
});
