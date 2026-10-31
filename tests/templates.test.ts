import { describe, expect, it } from 'vitest';
import { fillTemplate, fillTemplateMarked } from '@/lib/templates';

describe('fillTemplate', () => {
  it('puts the fan’s name in', () => {
    expect(fillTemplate('Hey {name}! Missed you, {NAME}', 'Ben')).toBe('Hey Ben! Missed you, Ben');
  });

  it('reads naturally without a name', () => {
    expect(fillTemplate('Hey {name}! How are you?', '')).toBe('Hey! How are you?');
  });

  it('says where the name went', () => {
    expect(fillTemplateMarked('Hi {name}, {name}!', 'Ben')).toEqual({
      text: 'Hi Ben, Ben!',
      names: [
        { start: 3, end: 6 },
        { start: 8, end: 11 },
      ],
    });
  });
});
