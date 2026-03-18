import { type BattleSourcePhase, resetBattleTracking, setOnFinalize } from './battle-tracker.ts';
import { buildBonusResult, createBonusData } from './bonus-round.ts';
import type { MeleeResult } from './melee-tracker.ts';
import { resetMeleeTracking, setOnMeleeFinalize } from './melee-tracker.ts';
import { teamUnitCounts } from './pools.ts';
import { resetScreenEffects } from './screen-effects.ts';
import { emptyProduction, emptyProductions } from './simulation/production.ts';
import type { GameLoopState } from './simulation/update.ts';
import type { TeamTuple } from './team.ts';
import { copyTeamCounts, TEAM0, TEAM1 } from './team.ts';
import type { BattleResult, BonusPhaseData, ProductionState } from './types-fleet.ts';
import { setCallbacks } from './ui/game-control.ts';
import { goToMeleeResult, goToResult } from './ui/game-result.ts';
import {
  hideMothershipHpBar,
  setupMeleeHUD,
  showMothershipHpBar,
  teardownMeleeHUD,
  updateHudRoundInfo,
} from './ui/hud/Hud.tsx';

/** battle-like フェーズ (battle / bonus) の共通初期化 */
function initBattlePhase(
  gs: GameLoopState,
  phase: 'battle' | 'bonus',
  prods: [ProductionState, ProductionState],
  bonusData: BonusPhaseData | null = null,
) {
  resetBattleTracking(phase);
  resetScreenEffects();
  gs.productions[TEAM0] = prods[0];
  gs.productions[TEAM1] = prods[1];
  gs.battlePhase = phase;
  gs.activeTeamCount = 2;
  gs.bonusData = bonusData;
  gs.phaseElapsed = 0;
  updateHudRoundInfo();
}

/** main.ts の gameLoopState に対するフェーズ遷移コールバックを一括登録する */
export function installPhaseCallbacks(gs: GameLoopState) {
  setOnFinalize((result: BattleResult, sourcePhase: BattleSourcePhase) => {
    const wasBonus = sourcePhase === 'bonus';
    gs.battlePhase = 'aftermath';
    hideMothershipHpBar();
    if (wasBonus) {
      const bd = gs.bonusData;
      if (!bd) {
        throw new Error('bonus phase finalized without bonusData');
      }
      goToResult({ roundType: 'bonus', battleResult: result, bonusReward: buildBonusResult(bd) });
    } else {
      goToResult({ roundType: 'battle', battleResult: result });
    }
  });

  setOnMeleeFinalize((result: MeleeResult) => {
    gs.battlePhase = 'aftermath';
    hideMothershipHpBar();
    teardownMeleeHUD();
    goToMeleeResult(result);
  });

  setCallbacks({
    battle(productions: [ProductionState, ProductionState]) {
      initBattlePhase(gs, 'battle', productions);
      showMothershipHpBar(2);
    },
    spectate() {
      resetScreenEffects();
      gs.productions = emptyProductions();
      gs.battlePhase = 'spectate';
      gs.activeTeamCount = 2;
      gs.bonusData = null;
      gs.phaseElapsed = 0;
      showMothershipHpBar(2);
    },
    melee(numTeams: number, productions: TeamTuple<ProductionState>) {
      resetMeleeTracking(numTeams, copyTeamCounts(teamUnitCounts));
      resetScreenEffects();
      gs.productions = productions;
      gs.battlePhase = 'melee';
      gs.activeTeamCount = numTeams;
      gs.bonusData = null;
      gs.phaseElapsed = 0;
      setupMeleeHUD(numTeams);
      showMothershipHpBar(numTeams);
    },
    bonus(production: ProductionState, bonusInfo: { totalHp: number }) {
      initBattlePhase(gs, 'bonus', [production, emptyProduction()], createBonusData(bonusInfo.totalHp));
      showMothershipHpBar(1);
    },
  });
}
