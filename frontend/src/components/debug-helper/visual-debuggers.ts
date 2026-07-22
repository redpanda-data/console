/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { IsDev } from '../../utils/env';

export type VisualDebuggerId = 'grayscale' | 'outlines' | 'blur' | 'grid' | 'no-motion' | 'testids' | 'a11y';

export type VisualDebugger = {
  id: VisualDebuggerId;
  label: string;
  description: string;
};

export const VISUAL_DEBUGGERS: VisualDebugger[] = [
  {
    id: 'grayscale',
    label: 'Grayscale',
    description: 'Render the whole app in grayscale to check contrast and that nothing relies on color alone.',
  },
  {
    id: 'outlines',
    label: 'Element outlines',
    description: 'Lime outline on every element to reveal layout structure, nesting depth, and phantom wrappers.',
  },
  {
    id: 'blur',
    label: 'Squint test (blur)',
    description: 'Blur the app to judge visual hierarchy — what still reads is what actually has weight.',
  },
  {
    id: 'grid',
    label: '8px baseline grid',
    description: 'Overlay an 8px grid to spot spacing and alignment drift.',
  },
  {
    id: 'no-motion',
    label: 'Disable animations',
    description:
      'Force CSS animations and transitions to near-zero duration to catch flicker and bad resting states. Completion events still fire.',
  },
  {
    id: 'testids',
    label: 'Missing test IDs',
    description: 'Dashed orange outline on interactive elements without data-testid — Playwright selector gaps.',
  },
  {
    id: 'a11y',
    label: 'A11y smells',
    description:
      'Dashed red outline on CSS-detectable issues: images without alt, empty unlabeled buttons/links, positive tabindex.',
  },
];

const STORAGE_KEY = '__debug_visual_debuggers';
const STYLE_ELEMENT_ID = '__debug-visual-styles';

// Filters on the root element do NOT create a containing block for fixed-position
// descendants (unlike on any other element), so grayscale/blur on <html> won't
// break dialogs, toasts, or sticky headers.
const DEBUG_CSS = `
html.__debug-grayscale { filter: grayscale(1); }
html.__debug-blur { filter: blur(3px); }
html.__debug-grayscale.__debug-blur { filter: grayscale(1) blur(3px); }

html.__debug-outlines * {
  outline: 1px solid #84cc16 !important;
  outline-offset: -1px !important;
}

html.__debug-grid::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(to right, rgba(217, 70, 239, 0.25) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(to bottom, rgba(217, 70, 239, 0.25) 0 1px, transparent 1px 8px);
}

html.__debug-no-motion *,
html.__debug-no-motion *::before,
html.__debug-no-motion *::after {
  animation-duration: 0.01ms !important;
  animation-delay: 0ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  transition-delay: 0ms !important;
  scroll-behavior: auto !important;
}

html.__debug-testids :is(button, a[href], input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [role='switch'], [role='checkbox'], [role='combobox']):not([data-testid]) {
  outline: 2px dashed #f97316 !important;
  outline-offset: 1px !important;
}

html.__debug-a11y img:not([alt]),
html.__debug-a11y :is(button, a):empty:not([aria-label]):not([aria-labelledby]):not([title]),
html.__debug-a11y [tabindex]:not([tabindex='0']):not([tabindex='-1']) {
  outline: 2px dashed #ef4444 !important;
  outline-offset: 1px !important;
}
`;

const KNOWN_IDS: ReadonlySet<string> = new Set(VISUAL_DEBUGGERS.map((d) => d.id));

function classFor(id: VisualDebuggerId): string {
  return `__debug-${id}`;
}

function readEnabled(): VisualDebuggerId[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is VisualDebuggerId => typeof id === 'string' && KNOWN_IDS.has(id));
  } catch {
    return [];
  }
}

function writeEnabled(ids: VisualDebuggerId[]): void {
  if (ids.length === 0) {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ELEMENT_ID;
  el.textContent = DEBUG_CSS;
  document.head.appendChild(el);
}

function applyDomState(enabled: VisualDebuggerId[]): void {
  ensureStyles();
  for (const { id } of VISUAL_DEBUGGERS) {
    document.documentElement.classList.toggle(classFor(id), enabled.includes(id));
  }
}

export function getEnabledVisualDebuggers(): VisualDebuggerId[] {
  return readEnabled();
}

export function setVisualDebugger(id: VisualDebuggerId, enabled: boolean): void {
  const current = new Set(readEnabled());
  if (enabled) {
    current.add(id);
  } else {
    current.delete(id);
  }
  // Keep storage in the registry's declaration order so re-apply is deterministic.
  const next = VISUAL_DEBUGGERS.map((d) => d.id).filter((d) => current.has(d));
  writeEnabled(next);
  applyDomState(next);
}

export function clearVisualDebuggers(): void {
  writeEnabled([]);
  applyDomState([]);
}

// Re-apply persisted debuggers at module load so a reload keeps the overlays
// without waiting for the dialog to mount.
if (IsDev && typeof window !== 'undefined') {
  try {
    const enabled = readEnabled();
    if (enabled.length > 0) {
      applyDomState(enabled);
    }
  } catch {
    // sessionStorage / DOM unavailable.
  }
}
