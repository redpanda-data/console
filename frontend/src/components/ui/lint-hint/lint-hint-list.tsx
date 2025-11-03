/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Text } from 'components/redpanda-ui/components/typography';
import { PencilRuler } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';

type LintHintListProps = {
  lintHints: Record<string, LintHint>;
};

export const LintHintList: React.FC<LintHintListProps> = ({ lintHints }) => {
  if (!lintHints || Object.keys(lintHints).length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PencilRuler className="h-4 w-4" />
        <Text className="font-medium" variant="label">
          Linting issues
        </Text>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        <div className="space-y-3 p-3">
          {Object.entries(lintHints).map(([toolName, hint]) => (
            <div className="space-y-1" key={toolName}>
              {hint.line > 0 ? (
                <div className="flex flex-col gap-1">
                  <Text className="font-medium text-gray-600 text-xs">
                    Line {hint.line}, Col {hint.column}
                  </Text>
                  <Text className="rounded border bg-white px-2 py-1 font-mono text-gray-800 text-sm leading-relaxed">
                    {hint.hint}
                  </Text>
                </div>
              ) : (
                <Text className="rounded border bg-white px-2 py-1 font-mono text-gray-800 text-sm leading-relaxed">
                  {hint.hint}
                </Text>
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
};
