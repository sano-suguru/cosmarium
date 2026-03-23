const PARTICLE_COUNT = 18;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const PARTICLE_STYLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = i * GOLDEN_ANGLE + ((i % 3) - 1) * 0.3;
  const dist = 50 + ((i * 17) % 90);
  return {
    '--tx': `${Math.round(Math.cos(angle) * dist)}px`,
    '--ty': `${Math.round(Math.sin(angle) * dist)}px`,
    '--delay': `${(i * 7) % 60}ms`,
    '--size': `${2 + (i % 4)}px`,
    '--dur': `${400 + ((i * 13) % 300)}ms`,
  } as Record<string, string>;
});
