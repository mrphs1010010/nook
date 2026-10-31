// Saved replies. "{name}" in a template stands for the fan's name.

export function fillTemplate(text: string, name: string): string {
  return fillTemplateMarked(text, name).text;
}

// The filled-in text, and where the name went in it, for showing the name highlighted.
export function fillTemplateMarked(text: string, name: string): { text: string; names: { start: number; end: number }[] } {
  // Nobody to name: drop the placeholder with the space before it ("Hey {name}!" → "Hey!").
  if (!name) return { text: text.replace(/ ?\{name\}/gi, ''), names: [] };
  const names: { start: number; end: number }[] = [];
  let filled = '';
  let at = 0;
  for (const match of text.matchAll(/\{name\}/gi)) {
    filled += text.slice(at, match.index);
    names.push({ start: filled.length, end: filled.length + name.length });
    filled += name;
    at = (match.index ?? 0) + match[0].length;
  }
  return { text: filled + text.slice(at), names };
}
