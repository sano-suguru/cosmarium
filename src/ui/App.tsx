import { render } from 'preact';
import { BattleResult } from './battle-result/BattleResult.tsx';
import { Codex } from './codex/Codex.tsx';
import { getElement } from './dom-util.ts';
import { FleetCompose } from './fleet-compose/FleetCompose.tsx';
import {
  advanceRound,
  goToMenu,
  handleAutoFollowToggle,
  onCodexToggle,
  setSpd,
  startBattle,
  startMelee,
  startNewRun,
  startSpectate,
} from './game-control.ts';
import { Hud } from './hud/Hud.tsx';
import { KillFeed } from './kill-feed/KillFeed.tsx';
import { Menu } from './menu/Menu.tsx';
import { PlayControls } from './play-controls/PlayControls.tsx';
import { codexOpen$, composeVisible$, gameState$, playUiVisible$, resultData$ } from './signals.ts';

function App() {
  const resultData = resultData$.value;

  return (
    <>
      {gameState$.value === 'menu' && !codexOpen$.value && (
        <Menu onStart={startNewRun} onSpectate={startSpectate} onMelee={startMelee} onCodex={onCodexToggle} />
      )}
      {composeVisible$.value && !codexOpen$.value && (
        <FleetCompose onLaunch={startBattle} onBack={goToMenu} onCodexToggle={onCodexToggle} />
      )}
      {resultData && !codexOpen$.value && (
        <BattleResult data={resultData} onMenu={goToMenu} onNextRound={advanceRound} />
      )}
      {gameState$.value === 'play' && !codexOpen$.value && (
        <>
          <Hud />
          <KillFeed />
        </>
      )}
      {playUiVisible$.value && !codexOpen$.value && (
        <PlayControls
          onCodexToggle={onCodexToggle}
          onAutoFollowToggle={handleAutoFollowToggle}
          onSpeedChange={setSpd}
        />
      )}
      {codexOpen$.value && <Codex onClose={onCodexToggle} />}
    </>
  );
}

export function mountApp() {
  render(<App />, getElement('app'));
}
