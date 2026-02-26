export function swapRemove<T>(arr: T[], i: number): void {
  const lastIdx = arr.length - 1;
  const last = arr[lastIdx];
  if (i !== lastIdx && last !== undefined) arr[i] = last;
  arr.pop();
}
