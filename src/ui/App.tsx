import { render } from 'preact';
import { DOM_ID_UI_ROOT } from './dom-ids.ts';
import { getElement } from './dom-util.ts';
import { onCodexToggle, startMelee, startNewRun, startSpectate } from './game-control.ts';
import { Menu } from './menu/Menu.tsx';
import { codexOpen$, gameState$ } from './signals.ts';

function App() {
  if (gameState$.value === 'menu' && !codexOpen$.value) {
    return <Menu onStart={startNewRun} onSpectate={startSpectate} onMelee={startMelee} onCodex={onCodexToggle} />;
  }
  return null;
}

export function mountApp() {
  render(<App />, getElement(DOM_ID_UI_ROOT));
}

export function _unmountApp() {
  render(null, getElement(DOM_ID_UI_ROOT));
}
