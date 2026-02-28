export function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`DOM element not found: #${id}`);
  return el;
}
