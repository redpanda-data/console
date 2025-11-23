/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Pre, Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';
import { PencilRuler } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import { memo } from 'react';

type LintHintListProps = {
  lintHints: Record<string, LintHint>;
  className?: string;
  isPending?: boolean;
};

export const LintHintList: React.FC<LintHintListProps> = memo(({ className, lintHints, isPending }) => {
  if (!lintHints || Object.keys(lintHints).length === 0 && !isPending) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <PencilRuler className="h-4 w-4" />
        <Text className="font-medium" variant="label">
          Linting issues
        </Text>
        {isPending && <Spinner size="sm" />}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex flex-col gap-4 p-3">
          {Object.entries(lintHints).map(([toolName, hint]) => (
            <div className="flex-col flex gap-1.5" key={toolName}>
              {hint.line > 0 ? (
                <div className="flex flex-col gap-1">
                  <Pre variant="dense">
                    Line {hint.line}, Col {hint.column}
                  </Pre>
                  <Pre variant="dense">
                    {hint.hint}
                  </Pre>
                </div>
              ) : (
                <Pre variant="dense">
                  {hint.hint}
                </Pre>
              )}
              {hint.lintType && (
                <Text className="font-medium text-gray-500 text-xs uppercase tracking-wide">{hint.lintType}</Text>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

LintHintList.displayName = 'LintHintList';
