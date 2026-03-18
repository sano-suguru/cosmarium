import { effect } from '@preact/signals';
import { render } from 'preact';
import { useEffect } from 'preact/hooks';
import { BattleResult } from './battle-result/BattleResult.tsx';
import { Codex } from './codex/Codex.tsx';
import { DevOverlay } from './dev-overlay/DevOverlay.tsx';
import { getElement } from './dom-util.ts';
import { FleetCompose } from './fleet-compose/FleetCompose.tsx';
import {
  advanceRound,
  confirmMothership,
  goToMenu,
  launchRound,
  onCodexToggle,
  setSpd,
  startMelee,
  startNewRun,
  startSpectate,
} from './game-control.ts';
import { Hud } from './hud/Hud.tsx';
import { handleAutoFollowToggle } from './keyboard-controls.ts';
import { KillFeed } from './kill-feed/KillFeed.tsx';
import { Menu } from './menu/Menu.tsx';
import { MothershipSelect } from './mothership-select/MothershipSelect.tsx';
import { PlayControls } from './play-controls/PlayControls.tsx';
import { codexOpen$, composePhase$, gameState$, playUiVisible$, resultData$ } from './signals.ts';

function App() {
  useEffect(() => {
    const el = document.getElementById('minimap');
    if (!el) {
      return;
    }
    return effect(() => {
      el.style.display = playUiVisible$.value && !codexOpen$.value ? 'block' : 'none';
    });
  }, []);

  const resultData = resultData$.value;

  return (
    <>
      {gameState$.value === 'menu' && !codexOpen$.value && (
        <Menu onStart={startNewRun} onSpectate={startSpectate} onMelee={startMelee} onCodex={onCodexToggle} />
      )}
      {composePhase$.value === 'mothership' && !codexOpen$.value && (
        <MothershipSelect onConfirm={confirmMothership} onBack={goToMenu} />
      )}
      {composePhase$.value === 'fleet' && !codexOpen$.value && (
        <FleetCompose onLaunch={launchRound} onBack={goToMenu} onCodexToggle={onCodexToggle} />
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
      {import.meta.env.DEV && <DevOverlay />}
    </>
  );
}

export function mountApp() {
  render(<App />, getElement('app'));
}
