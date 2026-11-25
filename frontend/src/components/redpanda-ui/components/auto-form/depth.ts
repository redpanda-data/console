/**
 * Map nesting depth to a heading level. Root is h2 (h1 is reserved for the page
 * heading); clamped at 5 because the heading scale has five rungs.
 */
export function headingLevelForDepth(depth: number): 2 | 3 | 4 | 5 {
  const level = 2 + depth;
  if (level >= 5) {
    return 5;
  }
  if (level >= 4) {
    return 4;
  }
  if (level >= 3) {
    return 3;
  }
  return 2;
}
