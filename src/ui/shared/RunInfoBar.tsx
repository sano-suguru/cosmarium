import { Hash, Trophy, Zap } from 'lucide-preact';
import type { RunStatus } from '../../types-fleet.ts';

type Props = {
  readonly info: RunStatus;
  readonly class?: string | undefined;
  readonly livesClass?: string | undefined;
};

export function RunInfoBar({ info, class: className, livesClass }: Props) {
  return (
    <div class={className}>
      <Hash size={12} />
      {` ROUND ${info.round} \u00a0 `}
      <span class={livesClass}>
        {Array.from({ length: info.lives }, (_, i) => (
          <Zap key={i} size={12} />
        ))}
      </span>
      {' \u00a0 '}
      <Trophy size={12} />
      {` ${info.wins}/${info.winTarget} WINS`}
    </div>
  );
}
