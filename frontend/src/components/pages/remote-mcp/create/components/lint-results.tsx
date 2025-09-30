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

interface LintResultsProps {
  lintResults: Record<string, LintHint>;
}

export const LintResults: React.FC<LintResultsProps> = ({ lintResults }) => {
  if (!lintResults || Object.keys(lintResults).length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PencilRuler className="h-4 w-4" />
        <Text variant="label" className="font-medium">
          Linting Issues
        </Text>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-3 space-y-3">
          {Object.entries(lintResults).map(([toolName, hint]) => (
            <div key={toolName} className="space-y-1">
              {hint.line > 0 ? (
                <div className="flex flex-col gap-1">
                  <Text className="text-xs font-medium text-gray-600">
                    Line {hint.line}, Col {hint.column}
                  </Text>
                  <Text className="text-sm font-mono leading-relaxed bg-white px-2 py-1 rounded border text-gray-800">
                    {hint.hint}
                  </Text>
                </div>
              ) : (
                <Text className="text-sm font-mono leading-relaxed bg-white px-2 py-1 rounded border text-gray-800">
                  {hint.hint}
                </Text>
              )}
              {hint.lintType && (
                <Text className="text-xs font-medium uppercase tracking-wide text-gray-500">{hint.lintType}</Text>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
