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

import { Badge, type BadgeVariant } from 'components/redpanda-ui/components/badge';
import { memo } from 'react';

import type { LogLevel } from './types';

type LogLevelConfig = {
  variant: BadgeVariant;
  label: string;
};

const LOG_LEVEL_CONFIG: Record<LogLevel, LogLevelConfig> = {
  TRACE: { variant: 'simple', label: 'TRACE' },
  DEBUG: { variant: 'neutral-inverted', label: 'DEBUG' },
  INFO: { variant: 'info-inverted', label: 'INFO' },
  WARN: { variant: 'warning-inverted', label: 'WARN' },
  ERROR: { variant: 'destructive-inverted', label: 'ERROR' },
};

type LogLevelBadgeProps = {
  /** Log level to display (TRACE, DEBUG, INFO, WARN, ERROR) */
  level: LogLevel | string | null;
  /** Badge size */
  size?: 'sm' | 'md' | 'lg';
};

/**
 * A badge component that displays a log level with appropriate styling.
 * Works with any log level string - unknown levels display as-is.
 */
export const LogLevelBadge = memo(({ level, size = 'sm' }: LogLevelBadgeProps) => {
  if (!level) {
    return (
      <Badge size={size} variant="simple">
        UNKNOWN
      </Badge>
    );
  }

  const normalizedLevel = level.toUpperCase() as LogLevel;
  const config = LOG_LEVEL_CONFIG[normalizedLevel];

  if (!config) {
    // Unknown level - display as-is
    return (
      <Badge size={size} variant="simple">
        {level}
      </Badge>
    );
  }

  return (
    <Badge size={size} variant={config.variant}>
      {config.label}
    </Badge>
  );
});

LogLevelBadge.displayName = 'LogLevelBadge';
