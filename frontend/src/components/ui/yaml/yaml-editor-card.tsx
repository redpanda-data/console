/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { Code, Maximize2, PencilRuler } from 'lucide-react';
import type { editor } from 'monaco-editor';

import { YamlEditor } from './yaml-editor';

interface YamlEditorCardProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  showLint?: boolean;
  showExpand?: boolean;
  onLint?: () => void;
  onExpand?: () => void;
  isLinting?: boolean;
  options?: editor.IStandaloneEditorConstructionOptions;
}

export const YamlEditorCard: React.FC<YamlEditorCardProps> = ({
  value,
  onChange,
  height = '500px',
  showLint = false,
  showExpand = false,
  onLint,
  onExpand,
  isLinting = false,
  options,
}) => {
  return (
    <div className="space-y-2">
      <div className="relative border rounded-lg">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Code className="h-4 w-4" />
            YAML Configuration
          </div>
          <div className="flex gap-1">
            {showLint && onLint && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLint}
                disabled={isLinting}
                className="h-7 px-2 text-xs gap-1"
              >
                <PencilRuler className="h-3 w-3" />
                {isLinting ? 'Linting...' : 'Lint'}
              </Button>
            )}
            {showExpand && onExpand && (
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs gap-1" onClick={onExpand}>
                <Maximize2 className="h-3 w-3" />
                Expand
              </Button>
            )}
          </div>
        </div>
        <div className="border-0 rounded-t-none overflow-hidden" style={{ height }}>
          <YamlEditor value={value} onChange={(val) => onChange(val || '')} options={options} />
        </div>
      </div>
    </div>
  );
};
