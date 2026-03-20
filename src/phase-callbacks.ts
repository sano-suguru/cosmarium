import { type BattleSourcePhase, resetBattleTracking, setOnFinalize } from './battle-tracker.ts';
import { buildBonusResult, createBonusData } from './bonus-round.ts';
import type { MeleeResult } from './melee-tracker.ts';
import { resetMeleeTracking, setOnMeleeFinalize } from './melee-tracker.ts';
import { isMothershipAwakened } from './mothership-defs.ts';
import { mothershipType, teamUnitCounts } from './pools.ts';
import { resetScreenEffects } from './screen-effects.ts';
import { getRunMergeCount } from './shop-state.ts';
import { emptyProduction, emptyProductions } from './simulation/production.ts';
import type { GameLoopState } from './simulation/update.ts';
import type { Team, TeamTuple } from './team.ts';
import { copyTeamCounts, TEAM0, TEAM1 } from './team.ts';
import type { BattleResult, BonusPhaseData, ProductionState, RoundEndInput } from './types-fleet.ts';
import { setCallbacks } from './ui/game-control.ts';
import { goToMeleeResult, goToResult } from './ui/game-result.ts';
import {
  hideMothershipHpBar,
  setupMeleeHUD,
  showMothershipHpBar,
  teardownMeleeHUD,
  updateHudRoundInfo,
} from './ui/hud/Hud.tsx';

/**
 * プレイヤー (Team0) の Ascension 覚醒チェック関数を構築。
 * 現仕様ではボットは Ascension を使わない（pickMothershipTypeByRound で除外）。
 * ボットに覚醒を解禁する場合はここでチーム別の覚醒状態を返すよう拡張する。
 */
function makeAwakenedCheck(): (team: Team) => boolean {
  return (team) => isMothershipAwakened(mothershipType[team], team === TEAM0 ? getRunMergeCount() : 0);
}

/** battle-like フェーズ (battle / boss / bonus) の共通初期化 */
function initBattlePhase(
  gs: GameLoopState,
  sourcePhase: BattleSourcePhase,
  prods: [ProductionState, ProductionState],
  bonusData: BonusPhaseData | null = null,
) {
  resetBattleTracking(sourcePhase);
  resetScreenEffects();
  gs.productions[TEAM0] = prods[0];
  gs.productions[TEAM1] = prods[1];
  gs.battlePhase = sourcePhase === 'bonus' ? 'bonus' : 'battle';
  gs.activeTeamCount = 2;
  gs.bonusData = bonusData;
  gs.phaseElapsed = 0;
  gs.isAwakened = makeAwakenedCheck();
  updateHudRoundInfo();
}

function buildCombatEndInput(result: BattleResult, roundType: 'battle' | 'boss'): RoundEndInput {
  return { roundType, battleResult: result };
}

function buildBonusEndInput(result: BattleResult, bonusData: BonusPhaseData): RoundEndInput {
  return { roundType: 'bonus', battleResult: result, bonusReward: buildBonusResult(bonusData) };
}

/** main.ts の gameLoopState に対するフェーズ遷移コールバックを一括登録する */
export function installPhaseCallbacks(gs: GameLoopState) {
  setOnFinalize((result: BattleResult, sourcePhase: BattleSourcePhase) => {
    gs.battlePhase = 'aftermath';
    hideMothershipHpBar();
    if (sourcePhase === 'bonus') {
      if (!gs.bonusData) {
        throw new Error('bonus phase finalized without bonusData');
      }
      goToResult(buildBonusEndInput(result, gs.bonusData));
    } else {
      goToResult(buildCombatEndInput(result, sourcePhase));
    }
  });

  setOnMeleeFinalize((result: MeleeResult) => {
    gs.battlePhase = 'aftermath';
    hideMothershipHpBar();
    teardownMeleeHUD();
    goToMeleeResult(result);
  });

  setCallbacks({
    battle(productions: [ProductionState, ProductionState], roundType: 'battle' | 'boss') {
      initBattlePhase(gs, roundType, productions);
      showMothershipHpBar(2);
    },
    spectate() {
      resetScreenEffects();
      gs.productions = emptyProductions();
      gs.battlePhase = 'spectate';
      gs.activeTeamCount = 2;
      gs.bonusData = null;
      gs.phaseElapsed = 0;
      gs.isAwakened = () => false;
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
      gs.isAwakened = makeAwakenedCheck();
      setupMeleeHUD(numTeams);
      showMothershipHpBar(numTeams);
    },
    bonus(production: ProductionState, bonusInfo: { totalHp: number }) {
      initBattlePhase(gs, 'bonus', [production, emptyProduction()], createBonusData(bonusInfo.totalHp));
      showMothershipHpBar(1);
    },
  });
}
