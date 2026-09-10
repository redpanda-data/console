/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

export type DetailSectionKey = 'metadata' | 'key' | 'headers' | 'value';

/** Every persisted preference of the message detail, stored as one object. */
export type DetailViewState = {
  /** Presentation: full-height sheet (true) or docked panel (false). */
  expanded: boolean;
  /** Expanded sheet width in pixels. */
  sheetWidth: number;
  /** Docked panel width as a percentage of the resizable group. */
  panelSizePct: number;
  /** Which sections are open — shared across messages, so a collapsed
   * Metadata stays collapsed while flipping through records. */
  sections: Record<DetailSectionKey, boolean>;
};

export const DEFAULT_DETAIL_VIEW_STATE: DetailViewState = {
  expanded: false,
  sheetWidth: 720,
  panelSizePct: 32,
  sections: { metadata: false, key: false, headers: false, value: true },
};

const STORAGE_KEY = 'messages.detailView';

export const readDetailViewState = (): DetailViewState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DETAIL_VIEW_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<DetailViewState>;
    return {
      ...DEFAULT_DETAIL_VIEW_STATE,
      ...parsed,
      sections: { ...DEFAULT_DETAIL_VIEW_STATE.sections, ...parsed.sections },
    };
  } catch {
    return DEFAULT_DETAIL_VIEW_STATE;
  }
};

/** Read-modify-write so independent writers (mode, widths, sections) don't clobber each other. */
export const patchDetailViewState = (patch: Partial<DetailViewState>): void => {
  try {
    const next = { ...readDetailViewState(), ...patch };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode) — preferences just won't persist
  }
};
