export function required<T>(v: T | null | undefined, name: string): T {
  if (v == null) throw new Error(`WebGL resource creation failed: ${name}`);
  return v;
}
