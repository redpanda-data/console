/**
 * Joins horizontally adjacent controls into one, as the registry's retired `Group attached` did from
 * context. Each control keeps its full border and the next overlaps it by a pixel, so the shared edge
 * is one hairline; a focused control lifts so its neighbour does not clip the ring. Pass these as the
 * control's own `className`: they do not depend on DOM order, which an open menu's focus guards change.
 */
export const attachedFirstClassName = 'rounded-r-none focus-visible:relative focus-visible:z-10';
export const attachedLastClassName = '-ml-px rounded-l-none focus-visible:relative focus-visible:z-10';
