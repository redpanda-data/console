import type { UseFormReturn } from 'react-hook-form';
import { type RetentionSizeUnit, type RetentionTimeUnit, sizeFactors, timeFactors } from 'utils/topicUtils';

import type { AddTopicFormData } from '../types/wizard';

const DECIMAL_PLACES_REGEX = /\.\d{4,}/;

// Default values for topic creation
export const DEFAULT_RETENTION_TIME_MS = 7;
export const DEFAULT_RETENTION_TIME_UNIT: RetentionTimeUnit = 'days';
export const DEFAULT_RETENTION_SIZE = 1;
export const DEFAULT_RETENTION_SIZE_UNIT: RetentionSizeUnit = 'GiB';

export const TOPIC_FORM_DEFAULTS = {
  topicName: '',
  partitions: 1,
  replicationFactor: 3,
  retentionTimeMs: DEFAULT_RETENTION_TIME_MS,
  retentionTimeUnit: DEFAULT_RETENTION_TIME_UNIT,
  retentionSize: DEFAULT_RETENTION_SIZE,
  retentionSizeUnit: DEFAULT_RETENTION_SIZE_UNIT,
} as const;

export const isUsingDefaultRetentionSettings = (data: AddTopicFormData): boolean =>
  data.retentionTimeMs === DEFAULT_RETENTION_TIME_MS &&
  data.retentionTimeUnit === DEFAULT_RETENTION_TIME_UNIT &&
  data.retentionSize === DEFAULT_RETENTION_SIZE &&
  data.retentionSizeUnit === DEFAULT_RETENTION_SIZE_UNIT;

export const resetToDefaults = (form: UseFormReturn<AddTopicFormData>) => {
  form.setValue('partitions', TOPIC_FORM_DEFAULTS.partitions);
  form.setValue('replicationFactor', TOPIC_FORM_DEFAULTS.replicationFactor);
  form.setValue('retentionTimeMs', TOPIC_FORM_DEFAULTS.retentionTimeMs);
  form.setValue('retentionTimeUnit', TOPIC_FORM_DEFAULTS.retentionTimeUnit);
  form.setValue('retentionSize', TOPIC_FORM_DEFAULTS.retentionSize);
  form.setValue('retentionSizeUnit', TOPIC_FORM_DEFAULTS.retentionSizeUnit);
};

export const findBestRetentionTimeUnit = (ms: number): { value: number; unit: RetentionTimeUnit } => {
  // Find the best unit by choosing the shortest text representation (same logic as CreateTopicModal)
  const validUnits = Object.entries(timeFactors)
    .filter(([unit]) => unit !== 'default' && unit !== 'infinite')
    .map(([unit, factor]) => ({
      unit: unit as RetentionTimeUnit,
      factor: factor as number,
    }))
    .map(({ unit, factor }) => ({
      unit,
      factor,
      value: ms / factor,
      textLength: String(ms / factor).length,
    }))
    .filter(({ value }) => value >= 1) // Only units that give us >= 1
    .sort((a, b) => a.textLength - b.textLength);

  const best = validUnits[0];
  if (!best) {
    return { value: ms, unit: 'ms' };
  }

  let value = best.value;
  // Clean up decimal places like in CreateTopicModal
  if (DECIMAL_PLACES_REGEX.test(String(value))) {
    value = Math.round(value);
  }

  return { value, unit: best.unit };
};

export const findBestRetentionSizeUnit = (bytes: number): { value: number; unit: RetentionSizeUnit } => {
  // Find the best unit by choosing the shortest text representation (same logic as CreateTopicModal)
  const validUnits = Object.entries(sizeFactors)
    .filter(([unit]) => unit !== 'default' && unit !== 'infinite')
    .map(([unit, factor]) => ({
      unit: unit as RetentionSizeUnit,
      factor: factor as number,
    }))
    .map(({ unit, factor }) => ({
      unit,
      factor,
      value: bytes / factor,
      textLength: String(bytes / factor).length,
    }))
    .filter(({ value }) => value >= 1) // Only units that give us >= 1
    .sort((a, b) => a.textLength - b.textLength);

  const best = validUnits[0];
  if (!best) {
    return { value: bytes, unit: 'Bit' };
  }

  let value = best.value;
  // Clean up decimal places like in CreateTopicModal
  if (DECIMAL_PLACES_REGEX.test(String(value))) {
    value = Math.round(value);
  }

  return { value, unit: best.unit };
};

export const parseTopicConfigFromExisting = (
  topic: { topicName: string; partitionCount?: number; replicationFactor?: number },
  config: { configEntries?: Array<{ name: string; value: string | null }> }
) => {
  const retentionMs = config?.configEntries?.find((entry) => entry.name === 'retention.ms');
  const retentionBytes = config?.configEntries?.find((entry) => entry.name === 'retention.bytes');

  let retentionTimeMs = DEFAULT_RETENTION_TIME_MS;
  let retentionTimeUnit: RetentionTimeUnit = DEFAULT_RETENTION_TIME_UNIT;
  let retentionSize = DEFAULT_RETENTION_SIZE;
  let retentionSizeUnit: RetentionSizeUnit = DEFAULT_RETENTION_SIZE_UNIT;

  // Parse retention.ms (-1 = infinite, otherwise find best unit)
  if (retentionMs?.value && retentionMs.value !== null) {
    const ms = Number.parseInt(retentionMs.value, 10);
    if (ms === -1) {
      retentionTimeUnit = 'infinite';
    } else if (ms > 0) {
      const { value, unit } = findBestRetentionTimeUnit(ms);
      retentionTimeMs = value;
      retentionTimeUnit = unit;
    }
  }

  // Parse retention.bytes (-1 = infinite, otherwise find best unit)
  if (retentionBytes?.value && retentionBytes.value !== null) {
    const bytes = Number.parseInt(retentionBytes.value, 10);
    if (bytes === -1) {
      retentionSizeUnit = 'infinite';
    } else if (bytes > 0) {
      const { value, unit } = findBestRetentionSizeUnit(bytes);
      retentionSize = value;
      retentionSizeUnit = unit;
    }
  }

  return {
    topicName: topic.topicName,
    partitions: topic.partitionCount || TOPIC_FORM_DEFAULTS.partitions,
    replicationFactor: topic.replicationFactor || TOPIC_FORM_DEFAULTS.replicationFactor,
    retentionTimeMs,
    retentionTimeUnit,
    retentionSize,
    retentionSizeUnit,
  };
};

export const parseRetentionFromConfig = (config: { configEntries?: Array<{ name: string; value: string | null }> }) =>
  parseTopicConfigFromExisting({ topicName: '' }, config);

// Form helper functions for input handling
export const createNumberChangeHandler =
  (onChange: (value?: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value ? Number.parseInt(e.target.value, 10) : undefined);
  };

export const createFloatChangeHandler =
  (onChange: (value?: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value ? Number.parseFloat(e.target.value) : 0);
  };

// Generate unit options from CreateTopicModal factors for consistency
export const getRetentionTimeUnitOptions = () => {
  return Object.keys(timeFactors)
    .filter((unit) => unit !== 'default') // Exclude default from UI options
    .map((unit) => ({
      value: unit,
      label: unit === 'infinite' ? 'Infinite' : unit,
    }));
};

export const getRetentionSizeUnitOptions = () => {
  return Object.keys(sizeFactors)
    .filter((unit) => unit !== 'default') // Exclude default from UI options
    .map((unit) => ({
      value: unit,
      label: unit === 'infinite' ? 'Infinite' : unit,
    }));
};

// Check if retention unit is disabled (infinite or default)
export const isRetentionUnitDisabled = (unit: string): boolean => unit === 'default' || unit === 'infinite';
