export type Child = Node | string | null | false | undefined;
type Props = Partial<Record<string, string | boolean | ((e: Event) => void) | undefined>>;

/** Minimal element builder: on* props become listeners, booleans become properties. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = String(v);
    else if (typeof v === "boolean") (el as unknown as Record<string, boolean>)[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}
