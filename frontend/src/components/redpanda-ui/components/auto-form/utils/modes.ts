import type { AutoFormMode } from '../types';

export function normalizeModes(modes: AutoFormMode[] | undefined): AutoFormMode[] {
  const resolved = (modes?.length ? modes : ['advanced']).filter(
    (mode): mode is AutoFormMode => mode === 'simple' || mode === 'advanced' || mode === 'json'
  );
  return resolved.length ? Array.from(new Set(resolved)) : ['advanced'];
}

export function resolveInitialMode(availableModes: AutoFormMode[], defaultMode?: AutoFormMode): AutoFormMode {
  if (defaultMode && availableModes.includes(defaultMode)) {
    return defaultMode;
  }

  if (availableModes.includes('advanced')) {
    return 'advanced';
  }

  return availableModes[0] ?? 'advanced';
}
