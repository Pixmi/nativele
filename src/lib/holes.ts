/** The {{ hole }} syntax: only a single identifier is allowed, no expressions or paths. Shared by the runtime and codegen. */
export const HOLE_ANY = /\{\{([\s\S]*?)\}\}/g;
export const IDENT = /^[A-Za-z_$][\w$]*$/;

export function holeName(inner: string): string | null {
  const s = inner.trim();
  return IDENT.test(s) ? s : null;
}
