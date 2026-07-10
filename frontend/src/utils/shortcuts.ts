import { isMacOS } from 'utils/platform';

/** Modifier-key label: ⌘ on macOS, Ctrl elsewhere. */
export const modKey = (): string => (isMacOS() ? '⌘' : 'Ctrl');
/** Option/Alt-key label: ⌥ on macOS, Alt elsewhere. */
export const altKey = (): string => (isMacOS() ? '⌥' : 'Alt');
/** Shift-key label: ⇧ on macOS, Shift elsewhere. */
export const shiftKey = (): string => (isMacOS() ? '⇧' : 'Shift');
/** Join key labels per platform: glyphs run together on macOS (⌘⇧Z), words with "+" elsewhere (Ctrl+Shift+Z). */
export const formatShortcut = (...keys: string[]): string => keys.join(isMacOS() ? '' : '+');
