import { describe, expect, test } from '@rstest/core';

import { clampTasks, MAX_TASKS, MIN_TASKS } from './tasks';

/**
 * The compute-units field is a Registry `Input type="number"` with `showStepControls`, which sets
 * the value outright: three clicks of the decrement stepper from 1 reach -2, and a typed value is
 * never clamped. Chakra's `NumberInput` enforced both bounds, so the guard lives here now.
 */
describe('clampTasks', () => {
  test('holds the minimum against a stepper walking below it', () => {
    expect(clampTasks(-2)).toBe(MIN_TASKS);
    expect(clampTasks(0)).toBe(MIN_TASKS);
  });

  test('holds the maximum against a typed value above it', () => {
    expect(clampTasks(999)).toBe(MAX_TASKS);
  });

  test('treats a cleared field as the minimum, not as zero', () => {
    expect(clampTasks('')).toBe(MIN_TASKS);
    expect(clampTasks('abc')).toBe(MIN_TASKS);
  });

  test('passes an in-range value through', () => {
    expect(clampTasks('12')).toBe(12);
    expect(clampTasks(MAX_TASKS)).toBe(MAX_TASKS);
  });
});
