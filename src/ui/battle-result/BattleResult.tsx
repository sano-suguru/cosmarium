import type { JSX } from 'preact';
import { TEAM_UI_HEX_COLORS } from '../../colors.ts';
import type { MeleeResult, TeamStats } from '../../melee-tracker.ts';
import type { Team } from '../../team.ts';
import type { RoundResult, RunResult, RunStatus } from '../../types-fleet.ts';
import btnStyles from '../shared/button.module.css';
import { RunInfoBar } from '../shared/RunInfoBar.tsx';
import styles from './BattleResult.module.css';
import meleeStyles from './MeleeResult.module.css';
import { buildElimMap, buildMeleeRanking, computeMaxKills } from './melee-ranking.ts';
import type { ResultData } from './result-data.ts';

type BattleResultProps = {
  readonly data: ResultData;
  readonly onMenu: () => void;
  readonly onNextRound: () => void;
};

export function BattleResult({ data, onMenu, onNextRound }: BattleResultProps) {
  return (
    <div class={styles.overlay}>
      <div class={styles.panel}>
        {data.type === 'round' && <RoundResultView roundResult={data.roundResult} runStatus={data.runStatus} />}
        {data.type === 'run' && <RunResultView runResult={data.runResult} />}
        {data.type === 'melee' && <MeleeResultView meleeResult={data.meleeResult} />}
        <div class={styles.actions}>
          <button type="button" class={`${btnStyles.btn} ${styles.actionBtn}`} onClick={onMenu}>
            MENU
          </button>
          {data.type === 'round' && (
            <button type="button" class={`${btnStyles.btn} ${styles.actionBtn}`} onClick={onNextRound}>
              NEXT ROUND
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function teamUiHex(team: Team): string {
  return TEAM_UI_HEX_COLORS[team];
}
function StatRows({ lines }: { readonly lines: readonly (readonly [string, string])[] }) {
  return (
    <div class={styles.stats}>
      {lines.map(([label, value]) => (
        <div key={label}>
          <span class={styles.label}>{label}</span> &nbsp;{value}
        </div>
      ))}
    </div>
  );
}

function VictoryTitle({
  victory,
  winText,
  loseText,
}: {
  readonly victory: boolean;
  readonly winText: string;
  readonly loseText: string;
}) {
  return (
    <div class={`${styles.title} ${victory ? styles.victory : styles.defeat}`}>{victory ? winText : loseText}</div>
  );
}

function RoundResultView({
  roundResult,
  runStatus,
}: {
  readonly roundResult: RoundResult;
  readonly runStatus: RunStatus;
}) {
  return (
    <>
      <RunInfoBar info={runStatus} class={styles.roundInfo} livesClass={styles.lives} />
      <VictoryTitle victory={roundResult.victory} winText="VICTORY" loseText="DEFEAT" />
      <StatRows
        lines={[
          ['戦闘時間:', formatTime(roundResult.elapsed)],
          ['残存艦艇:', String(roundResult.playerSurvivors)],
          ['撃破敵艦:', String(roundResult.enemyKills)],
        ]}
      />
    </>
  );
}

function RunResultView({ runResult }: { readonly runResult: RunResult }) {
  return (
    <>
      <div class={styles.roundInfo}>{runResult.rounds} ROUNDS</div>
      <VictoryTitle victory={runResult.cleared} winText="RUN CLEAR" loseText="RUN OVER" />
      <StatRows
        lines={[
          ['勝利:', `${runResult.wins}`],
          ['敗北:', `${runResult.losses}`],
          ['総撃破:', `${runResult.totalKills}`],
        ]}
      />
    </>
  );
}
function MeleeTitle({ result }: { readonly result: MeleeResult }) {
  if (result.winnerTeam !== null) {
    const hex = teamUiHex(result.winnerTeam);
    return (
      <div
        class={`${styles.title} ${styles.victory}`}
        style={{
          background: `linear-gradient(135deg, ${hex}, #0ff, ${hex})`,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: `0 0 30px ${hex}, 0 0 60px ${hex}50, 0 0 100px rgba(0,255,255,0.15)`,
        }}
      >
        TEAM {result.winnerTeam + 1} WINS
      </div>
    );
  }
  return <div class={`${styles.title} ${styles.defeat}`}>DRAW</div>;
}

const RANK_CLASSES = [meleeStyles.rank1, meleeStyles.rank2, meleeStyles.rank3];

function ScoreRow({
  rank,
  teamIdx,
  stats,
  elimMap,
  maxKills,
}: {
  readonly rank: number;
  readonly teamIdx: Team;
  readonly stats: TeamStats;
  readonly elimMap: Map<number, number>;
  readonly maxKills: number;
}) {
  const hex = teamUiHex(teamIdx);
  const barWidth = maxKills > 0 ? (stats.kills / maxKills) * 48 : 0;
  const elimTime = elimMap.get(teamIdx);

  const rankClass = RANK_CLASSES[rank];

  const rowStyle: JSX.CSSProperties = {
    animationDelay: `${rank * 0.1}s`,
  };
  if (rank === 0) {
    rowStyle.background = `linear-gradient(90deg, ${hex}18, transparent 70%)`;
    rowStyle.color = hex;
  }

  return (
    <div class={`${meleeStyles.scoreRow}${rankClass ? ` ${rankClass}` : ''}`} style={rowStyle}>
      <span class={meleeStyles.meleeRank}>#{rank + 1}</span>
      <span class={meleeStyles.meleeDot} style={{ background: hex, boxShadow: `0 0 6px ${hex}, 0 0 12px ${hex}60` }} />
      <span class={meleeStyles.meleeTeamName}>TEAM {teamIdx + 1}</span>
      <span class={meleeStyles.killsWrap}>
        <span class={meleeStyles.killsBar} style={{ width: `${barWidth}px`, background: hex }} />
        <span class={meleeStyles.kills}>{String(stats.kills).padStart(3, ' ')} KILLS</span>
      </span>
      <span class={`${meleeStyles.meleeStatus} ${stats.survivors <= 0 ? meleeStyles.eliminated : ''}`}>
        {stats.survivors > 0
          ? `残存 ${stats.survivors}/${stats.initialUnits}`
          : `全滅 ${elimTime !== undefined ? formatTime(elimTime) : '-'}`}
      </span>
    </div>
  );
}

function MeleeResultView({ meleeResult }: { readonly meleeResult: MeleeResult }) {
  const elimMap = buildElimMap(meleeResult.eliminations);
  const ranking = buildMeleeRanking(meleeResult, elimMap);
  const maxKills = computeMaxKills(meleeResult);

  return (
    <>
      <MeleeTitle result={meleeResult} />
      <div class={styles.stats}>
        <div class={meleeStyles.meleeInfo}>
          <span>
            <span class={meleeStyles.meleeLabel}>戦闘時間:</span> {formatTime(meleeResult.elapsed)}
          </span>
          <span>
            <span class={meleeStyles.meleeLabel}>初期勢力:</span> {meleeResult.numTeams}
          </span>
        </div>
        <div class={meleeStyles.meleeSectionHeader}>SCOREBOARD</div>
        {ranking.map((teamIdx, rank) => {
          const stats = meleeResult.teamStats[teamIdx];
          if (!stats) {
            return null;
          }
          return (
            <ScoreRow key={teamIdx} rank={rank} teamIdx={teamIdx} stats={stats} elimMap={elimMap} maxKills={maxKills} />
          );
        })}
      </div>
    </>
  );
}
