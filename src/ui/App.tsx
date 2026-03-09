import { render } from 'preact';
import { BattleResult } from './battle-result/BattleResult.tsx';
import { DOM_ID_UI_ROOT } from './dom-ids.ts';
import { getElement } from './dom-util.ts';
import { advanceRound, goToMenu, onCodexToggle, startMelee, startNewRun, startSpectate } from './game-control.ts';
import { Menu } from './menu/Menu.tsx';
import { codexOpen$, gameState$, resultData$ } from './signals.ts';

function App() {
  const resultData = resultData$.value;

  return (
    <>
      {gameState$.value === 'menu' && !codexOpen$.value && (
        <Menu onStart={startNewRun} onSpectate={startSpectate} onMelee={startMelee} onCodex={onCodexToggle} />
      )}
      {resultData && !codexOpen$.value && (
        <BattleResult data={resultData} onMenu={goToMenu} onNextRound={advanceRound} />
      )}
    </>
  );
}

export function mountApp() {
  render(<App />, getElement(DOM_ID_UI_ROOT));
}
