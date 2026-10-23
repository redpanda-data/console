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

import type { KeyboardEvent } from 'react';
import { z } from 'zod';

import type { InputEndBehavior } from '../utils/input-end-behavior';
import { isValidIdleTimeout, parseMessageLimit, type StopConditionDraft } from '../utils/read-until';
import { isStopConditionSet, type StopCondition } from '../utils/yaml';

// The stop condition editor's form model.

const STOP_MODES = ['none', 'count', 'idle', 'check'] as const;

export type StopMode = (typeof STOP_MODES)[number];

const DEFAULT_LIMIT = '1000';
export const DEFAULT_IDLE = '30s';
const POSITIVE_INT_RE = /^\d+$/;

const usesIdle = (s: { mode: StopMode; alsoIdle: boolean }): boolean =>
  s.mode === 'idle' || (s.mode !== 'none' && s.alsoIdle);

/** The editor's form. Each field is checked only when the chosen mode reads it. */
export const stopFormSchema = z
  .object({
    mode: z.enum(STOP_MODES),
    limit: z.string(),
    idle: z.string(),
    check: z.string(),
    /** With a count/check: also stop once idle. */
    alsoIdle: z.boolean(),
    restart: z.boolean(),
  })
  .superRefine((s, ctx) => {
    const issue = (path: 'limit' | 'idle' | 'check', message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const limit = s.limit.trim();
    if (
      s.mode === 'count' &&
      !(POSITIVE_INT_RE.test(limit) && Number(limit) > 0 && Number.isSafeInteger(Number(limit)))
    ) {
      issue('limit', 'Enter a whole number greater than 0.');
    }
    if (s.mode === 'check' && s.check.trim() === '') {
      issue('check', 'Enter a Bloblang condition.');
    }
    if (usesIdle(s) && !isValidIdleTimeout(s.idle)) {
      issue('idle', 'Enter a duration such as 30s, 5m or 1h.');
    }
  });

export type StopFormState = z.infer<typeof stopFormSchema>;

/** The editor's starting state for a slot's current condition. */
export function stopFormState(condition?: StopCondition): StopFormState {
  const state: StopFormState = {
    mode: 'none',
    limit: DEFAULT_LIMIT,
    idle: condition?.idleTimeout ?? DEFAULT_IDLE,
    check: '',
    alsoIdle: false,
    restart: Boolean(condition?.restartInput),
  };
  if (!isStopConditionSet(condition)) {
    return state;
  }
  const limit = parseMessageLimit(condition.check);
  if (limit) {
    return { ...state, mode: 'count', limit: String(limit.limit), alsoIdle: Boolean(condition.idleTimeout) };
  }
  if (condition.check) {
    return { ...state, mode: 'check', check: condition.check, alsoIdle: Boolean(condition.idleTimeout) };
  }
  return { ...state, mode: 'idle' };
}

/**
 * Whether the form offers `restart_input`: with a count or check, for an input that can finish before
 * it's met (with an idle timeout alone, a re-read input never goes idle). One the YAML already sets
 * stays on offer, so applying never drops it unseen.
 */
export function offersRestart(mode: StopMode, own: InputEndBehavior, condition?: StopCondition): boolean {
  return Boolean(condition?.restartInput) || ((mode === 'count' || mode === 'check') && own.kind !== 'continuous');
}

/** What the form asks for; null keeps the input running with no stop condition. */
export function draftFromStopForm(s: StopFormState, restartOffered = true): StopConditionDraft | null {
  if (s.mode === 'none') {
    return null;
  }
  const idleTimeout = usesIdle(s) ? s.idle.trim() : undefined;
  const restartInput = (restartOffered && s.restart) || undefined;
  if (s.mode === 'idle') {
    return { idleTimeout, restartInput };
  }
  if (s.mode === 'count') {
    return { messageLimit: Number(s.limit.trim()), idleTimeout, restartInput };
  }
  return { check: s.check.trim(), idleTimeout, restartInput };
}

/** What can still leave the input running with the condition as chosen. */
export function backstopHint(
  s: Pick<StopFormState, 'mode' | 'restart' | 'alsoIdle' | 'limit'>,
  own: InputEndBehavior
): string | undefined {
  const rereads = s.restart && own.kind !== 'continuous';
  if (s.mode === 'idle') {
    return rereads
      ? 'The input is read again each time it finishes, so it never goes idle and never stops.'
      : undefined;
  }
  if (!(s.mode === 'count' || s.mode === 'check')) {
    return;
  }
  if (rereads) {
    return 'If no message ever meets the condition, the input is read again and again and never stops.';
  }
  if (s.alsoIdle || own.kind !== 'continuous') {
    return;
  }
  const limit = s.limit.trim();
  const shortfall =
    s.mode === 'count' && POSITIVE_INT_RE.test(limit) ? `If fewer than ${limit} messages arrive` : 'If none arrives';
  return `${shortfall}, it keeps running. Also stop when idle as a backstop.`;
}

/** For a popover's `onKeyDown`: Escape closes only it, as the canvas's Escape-to-deselect skips handled events. */
export function claimEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
  }
}
