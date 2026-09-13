/** Deterministic gradient class (g0…g5) for an event id — the same id always gets the same artwork. */
export function artClass(id: string) {
  let h = 0;
  for (const ch of id) h = (31 * h + ch.charCodeAt(0)) % 6;
  return `g${h}`;
}
