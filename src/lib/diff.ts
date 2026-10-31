// What changed between a message and the AI's version of it, word by word, so the changes
// can be shown highlighted.

export interface Change {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

// Words (with apostrophes), runs of spaces, and single other characters (punctuation, emoji).
const TOKEN = /[\p{L}\p{N}'’]+|\s+|[^\p{L}\p{N}'’\s]/gu;
const MAX_CELLS = 250_000; // beyond this, show the whole text as replaced

export function diffWords(before: string, after: string): Change[] {
  const a = before.match(TOKEN) ?? [];
  const b = after.match(TOKEN) ?? [];
  if (a.length * b.length > MAX_CELLS) {
    return [
      { kind: 'removed', text: before },
      { kind: 'added', text: after },
    ].filter((c) => c.text) as Change[];
  }

  // Longest common subsequence, filled from the end so the walk below goes forward.
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcs[(i + 1) * width + j + 1]! + 1 : Math.max(lcs[(i + 1) * width + j]!, lcs[i * width + j + 1]!);
    }
  }

  // One step per token. A space between two changed words joins them ("both" sides), so
  // "vid tonite" → "video tonight" reads as one replacement rather than two.
  const steps: { kind: Change['kind'] | 'both'; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      steps.push({ kind: 'same', text: a[i++]! });
      j++;
    } else if (i < a.length && (j === b.length || lcs[(i + 1) * width + j]! >= lcs[i * width + j + 1]!)) {
      steps.push({ kind: 'removed', text: a[i++]! });
    } else {
      steps.push({ kind: 'added', text: b[j++]! });
    }
  }
  const changed = (k: number) => steps[k] !== undefined && steps[k].kind !== 'same';
  steps.forEach((step, k) => {
    if (step.kind === 'same' && /^\s+$/.test(step.text) && changed(k - 1) && changed(k + 1)) step.kind = 'both';
  });

  const changes: Change[] = [];
  const push = (kind: Change['kind'], text: string) => {
    if (!text) return;
    const last = changes.at(-1);
    if (last?.kind === kind) last.text += text;
    else changes.push({ kind, text });
  };
  let removed = '';
  let added = '';
  const flush = () => {
    push('removed', removed);
    push('added', added);
    removed = added = '';
  };
  for (const step of steps) {
    if (step.kind === 'same') {
      flush();
      push('same', step.text);
      continue;
    }
    if (step.kind !== 'added') removed += step.text;
    if (step.kind !== 'removed') added += step.text;
  }
  flush();
  return changes;
}
