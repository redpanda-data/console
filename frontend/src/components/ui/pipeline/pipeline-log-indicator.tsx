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
import { Text } from 'components/redpanda-ui/components/typography';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { memo } from 'react';
import type { ScopedIssueCounts } from 'react-query/api/pipeline-messages';

type BadgeWithDotProps = {
  count: number;
  variant: BadgeVariant;
  icon: React.ReactNode;
  label: string;
};

const formatCount = (count: number): string => {
  if (count >= 100) {
    return `100+`;
  }
  return count.toString();
};

const BadgeWithDot = memo(({ count, variant, icon, label }: BadgeWithDotProps) => {
  if (count === 0) {
    return null;
  }

  return (
    <div className="relative inline-flex">
      <Badge icon={icon} variant={variant} size="lg">
        {label}
      </Badge>
      <span
        className={cn(
          'absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
          variant === 'destructive-inverted' && 'bg-background-error-strong',
          variant === 'warning-inverted' && 'bg-background-warning-strong'
        )}
      >
        <Text className="text-inverse" variant="captionStrongMedium">{formatCount(count)}</Text>
      </span>
    </div>
  );
});

BadgeWithDot.displayName = 'BadgeWithDot';

type PipelineLogIndicatorProps = {
  /** Scoped issue counts (input, output, or root issues) */
  counts?: ScopedIssueCounts;
  isLoading?: boolean;
};

/**
 * Displays issue counts (errors/warnings) as badges with count indicators.
 * Accepts scoped counts for a specific category (input, output, or root).
 */
export const PipelineLogIndicator = memo(({ counts, isLoading }: PipelineLogIndicatorProps) => {
  if (isLoading) {
    return <Skeleton className="h-6 w-16" />;
  }

  if (!counts) {
    return null;
  }

  const hasIssues = counts.errors > 0 || counts.warnings > 0;

  if (!hasIssues) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <BadgeWithDot
        count={counts.errors}
        icon={<AlertCircle className="h-3 w-3" />}
        label="Error"
        variant="destructive-inverted"
      />
      <BadgeWithDot
        count={counts.warnings}
        icon={<AlertTriangle className="h-3 w-3" />}
        label="Warn"
        variant="warning-inverted"
      />
    </div>
  );
});

PipelineLogIndicator.displayName = 'PipelineLogIndicator';
