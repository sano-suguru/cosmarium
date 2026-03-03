export function getElement(id: string): HTMLElement;
export function getElement<T extends HTMLElement>(id: string, ctor: abstract new (...args: never[]) => T): T;
export function getElement(id: string, ctor?: abstract new (...args: never[]) => HTMLElement): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`DOM element not found: #${id}`);
  }
  if (ctor && !(el instanceof ctor)) {
    throw new TypeError(`#${id} is not an instance of ${ctor.name}`);
  }
  return el;
}
