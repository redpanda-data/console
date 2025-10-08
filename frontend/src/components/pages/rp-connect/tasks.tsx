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
