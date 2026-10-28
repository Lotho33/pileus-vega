// Pure helper of the plugin reorder dialog.

/** `list` with the item at `from` moved by `delta`, clamped to the ends. */
export function moveItem<T>(list: T[], from: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, from + delta));
  if (to === from) {
    return list;
  }
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}
