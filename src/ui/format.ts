export function formatLivesText(lives: number): string {
  return '\u2764 '.repeat(lives).trimEnd();
}
