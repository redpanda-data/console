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

/**
 * Shared topic utilities for retention time and size conversions
 * Used by both CreateTopicModal and rp-connect wizard
 */

export type RetentionTimeUnit = keyof typeof timeFactors;
export const timeFactors = {
  default: -1,
  infinite: Number.POSITIVE_INFINITY,

  ms: 1,
  seconds: 1000,
  minutes: 1000 * 60,
  hours: 1000 * 60 * 60,
  days: 1000 * 60 * 60 * 24,
  months: 1000 * 60 * 60 * 24 * (365 / 12),
  years: 1000 * 60 * 60 * 24 * 365,
} as const;

export type RetentionSizeUnit = keyof typeof sizeFactors;
export const sizeFactors = {
  default: -1,
  infinite: Number.POSITIVE_INFINITY,

  Bit: 1,
  KiB: 1024,
  MiB: 1024 * 1024,
  GiB: 1024 * 1024 * 1024,
  TiB: 1024 * 1024 * 1024 * 1024,
} as const;

/**
 * Converts retention time to milliseconds
 * @param value The numeric value
 * @param unit The time unit
 * @returns Milliseconds (-1 for infinite/default)
 */
export function convertRetentionTimeToMs(value: number, unit: RetentionTimeUnit | string): number {
  if (unit === 'infinite' || unit === 'default') {
    return -1;
  }

  const multipliers: Record<string, number> = {
    ms: 1,
    seconds: 1000,
    minutes: 1000 * 60,
    hours: 1000 * 60 * 60,
    days: 1000 * 60 * 60 * 24,
    months: 1000 * 60 * 60 * 24 * (365 / 12),
    years: 1000 * 60 * 60 * 24 * 365,
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Converts retention size to bytes
 * @param value The numeric value
 * @param unit The size unit
 * @returns Bytes (-1 for infinite/default)
 */
export function convertRetentionSizeToBytes(value: number, unit: RetentionSizeUnit | string): number {
  if (unit === 'infinite' || unit === 'default') {
    return -1;
  }

  const multipliers: Record<string, number> = {
    Bit: 1,
    KiB: 1024,
    MiB: 1024 * 1024,
    GiB: 1024 * 1024 * 1024,
    TiB: 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * (multipliers[unit] || 1));
}

/**
 * Validates replication factor for Redpanda (must be odd) or generic Kafka
 * @param replicationFactor The replication factor to validate
 * @param isRedpanda Whether this is a Redpanda cluster
 * @returns Error message if invalid, empty string if valid
 */
export function validateReplicationFactor(replicationFactor: number, isRedpanda: boolean): string {
  if (isRedpanda) {
    // Enforce odd numbers for Redpanda
    const isOdd = replicationFactor % 2 === 1;
    if (!isOdd) {
      return 'Replication factor must be an odd number';
    }
  }
  return '';
}
