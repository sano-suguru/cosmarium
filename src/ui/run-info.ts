import type { RunStatus } from '../types.ts';

/** ラン情報の DOM ノード生成（横断ユーティリティ） */
export function createRunInfoNodes(info: RunStatus): DocumentFragment {
  const frag = document.createDocumentFragment();

  frag.append(`ROUND ${info.round} \u00a0 `);

  const heartsSpan = document.createElement('span');
  heartsSpan.className = 'lives';
  heartsSpan.textContent = '\u2764 '.repeat(info.lives).trimEnd();
  frag.append(heartsSpan);

  frag.append(` \u00a0 ${info.wins}/${info.winTarget} WINS`);

  return frag;
}

/** ラン情報要素を更新（表示/非表示切替を含む） */
export function updateRunInfoElement(el: HTMLElement, info: RunStatus | null) {
  if (info) {
    el.textContent = '';
    el.append(createRunInfoNodes(info));
    el.classList.add('active');
  } else {
    el.textContent = '';
    el.classList.remove('active');
  }
}
