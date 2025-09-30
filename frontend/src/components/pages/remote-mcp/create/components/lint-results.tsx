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
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertCircle, AlertTriangle, Info, PencilRuler } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';

interface LintResultsProps {
  lintResults: Record<string, LintHint>;
}

/**
 * Get styling based on lint type (error, warning, info)
 */
const getLintTypeStyles = (lintType?: string) => {
  const type = lintType?.toLowerCase() || 'error';

  switch (type) {
    case 'error':
      return {
        containerBg: 'bg-red-50',
        containerBorder: 'border-red-200',
        hintBg: 'bg-red-100',
        hintBorder: 'border-red-300',
        hintText: 'text-red-900',
        labelText: 'text-red-700',
        icon: <AlertCircle className="h-4 w-4 text-red-600" />,
      };
    case 'warning':
      return {
        containerBg: 'bg-amber-50',
        containerBorder: 'border-amber-200',
        hintBg: 'bg-amber-100',
        hintBorder: 'border-amber-300',
        hintText: 'text-amber-900',
        labelText: 'text-amber-700',
        icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
      };
    case 'info':
      return {
        containerBg: 'bg-blue-50',
        containerBorder: 'border-blue-200',
        hintBg: 'bg-blue-100',
        hintBorder: 'border-blue-300',
        hintText: 'text-blue-900',
        labelText: 'text-blue-700',
        icon: <Info className="h-4 w-4 text-blue-600" />,
      };
    default:
      return {
        containerBg: 'bg-gray-50',
        containerBorder: 'border-gray-200',
        hintBg: 'bg-white',
        hintBorder: 'border-gray-300',
        hintText: 'text-gray-800',
        labelText: 'text-gray-600',
        icon: <PencilRuler className="h-4 w-4 text-gray-600" />,
      };
  }
};

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
      <div className="space-y-2">
        {Object.entries(lintResults).map(([toolName, hint]) => {
          const styles = getLintTypeStyles(hint.lintType);

          return (
            <div
              key={toolName}
              className={cn('rounded-lg overflow-hidden border', styles.containerBg, styles.containerBorder)}
            >
              <div className="p-3 space-y-2">
                {hint.line > 0 && (
                  <div className="flex items-center gap-2">
                    {styles.icon}
                    <Text className={cn('text-xs font-medium', styles.labelText)}>
                      Line {hint.line}, Col {hint.column}
                    </Text>
                  </div>
                )}
                <div
                  className={cn(
                    'text-sm font-mono leading-relaxed px-3 py-2 rounded border',
                    styles.hintBg,
                    styles.hintBorder,
                    styles.hintText,
                  )}
                >
                  {hint.hint}
                </div>
                {hint.lintType && (
                  <Text className={cn('text-xs font-medium uppercase tracking-wide', styles.labelText)}>
                    {hint.lintType}
                  </Text>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
