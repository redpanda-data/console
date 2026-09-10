export const MIN_TASKS = 1,
  MAX_TASKS = 72;

const milliValueRegex = /^(\d+(\.\d+)?)(m?)$/;

export function cpuToTasks(cpu: string | undefined): number | undefined {
  if (!cpu) {
    return;
  }
  const match = cpu.match(milliValueRegex);
  if (!match) {
    return;
  }

  const value = Number.parseFloat(match[1]);
  const isMilli = match[3] === 'm';
  const cpuMilli = isMilli ? value : value * 1000;
  return cpuMilli / 100;
}

export function tasksToCPU(tasks: number | undefined): string | undefined {
  if (!tasks) {
    return;
  }
  return `${tasks * 100}m`;
}

/**
 * Chakra's NumberInput clamped to `min`/`max`; the Registry Input does not, and its steppers set
 * the value outright, so an unclamped field reaches `tasksToCPU` and the API.
 */
export function clampTasks(value: string | number): number {
  const tasks = Number(value);
  if (!Number.isFinite(tasks) || tasks < MIN_TASKS) {
    return MIN_TASKS;
  }
  return Math.min(Math.trunc(tasks), MAX_TASKS);
}
