/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { SimpleCodeBlock } from 'components/redpanda-ui/components/code-block';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { CheckCircleIcon } from 'components/icons';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { memo } from 'react';

type LintHintListProps = {
  lintHints: Record<string, LintHint>;
  className?: string;
  isPending?: boolean;
};

export const LintHintList: React.FC<LintHintListProps> = memo(({ className, lintHints, isPending }) => {
  const hasHints = lintHints && Object.keys(lintHints).length > 0;

  if (!hasHints && !isPending) {
    return (
      <div className={cn('flex items-center gap-2 py-4 text-muted-foreground', className)}>
        <CheckCircleIcon className="size-4 text-success" />
        <Text className="text-muted-foreground text-sm">No issues found</Text>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {isPending && !hasHints && <Spinner className="size-4 text-foreground" />}
      {hasHints && (
        <div className="overflow-hidden rounded-lg border border-surface-strong">
          <div className="flex flex-col gap-4 p-3">
            {Object.entries(lintHints).map(([toolName, hint]) => (
              <div className="flex-col flex gap-1.5" key={toolName}>
                {hint.line > 0 ? (
                    <SimpleCodeBlock code={`Line ${hint.line}, Col ${hint.column}: ${hint.hint}`} width="full" className="my-0"/>
                ) : (
                  <SimpleCodeBlock code={hint.hint} width="full" className="my-0"/>
                )}
                {hint.lintType && (
                  <Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{hint.lintType}</Text>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

LintHintList.displayName = 'LintHintList';
