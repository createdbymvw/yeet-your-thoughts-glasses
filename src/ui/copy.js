/**
 * Closing lines shown in the afterglow. Understated on purpose.
 */
export const AFTERGLOW_LINES = Object.freeze([
  'gone. carry on.',
  'noted. deleted.',
  'released into the void.',
  "you don't need that one right now.",
  'yeeted.',
  'that one was never load-bearing.',
  'ash now. nice.',
]);

let last = -1;

/** Pick a random line, never the same one twice in a row. The first pick is always the canonical line. */
export function pickAfterglowLine() {
  if (last === -1) { last = 0; return AFTERGLOW_LINES[0]; }
  let i;
  do { i = Math.floor(Math.random() * AFTERGLOW_LINES.length); } while (i === last);
  last = i;
  return AFTERGLOW_LINES[i];
}
