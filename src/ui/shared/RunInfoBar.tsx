import type { RunStatus } from '../../types-fleet.ts';
import { formatLivesText } from '../format.ts';

type Props = {
  readonly info: RunStatus;
  readonly class?: string | undefined;
  readonly livesClass?: string | undefined;
};

export function RunInfoBar({ info, class: className, livesClass }: Props) {
  return (
    <div class={className}>
      {`ROUND ${info.round} \u00a0 `}
      <span class={livesClass}>{formatLivesText(info.lives)}</span>
      {` \u00a0 ${info.wins}/${info.winTarget} WINS`}
    </div>
  );
}
