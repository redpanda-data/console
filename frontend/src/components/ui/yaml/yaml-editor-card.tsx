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

type YamlEditorCardProps = {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  showLint?: boolean;
  showExpand?: boolean;
  onLint?: () => void;
  onExpand?: () => void;
  isLinting?: boolean;
  options?: editor.IStandaloneEditorConstructionOptions;
};

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
  // When height is 100%, use flex layout to properly fill the container
  const isFlexHeight = height === '100%';

  return (
    <div className={isFlexHeight ? 'flex min-h-0 flex-1 flex-col' : 'space-y-2'}>
      <div
        className={
          isFlexHeight ? 'relative flex min-h-0 flex-1 flex-col rounded-lg border' : 'relative rounded-lg border'
        }
      >
        <div className="flex flex-shrink-0 items-center justify-between rounded-t-lg border-b bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <Code className="h-4 w-4" />
            YAML Configuration
          </div>
          <div className="flex gap-1">
            {showLint && onLint && (
              <Button
                className="h-7 gap-1 px-2 text-xs"
                disabled={isLinting}
                onClick={onLint}
                size="sm"
                type="button"
                variant="outline"
              >
                <PencilRuler className="h-3 w-3" />
                {isLinting ? 'Linting...' : 'Lint'}
              </Button>
            )}
            {showExpand && onExpand && (
              <Button className="h-7 gap-1 px-2 text-xs" onClick={onExpand} size="sm" type="button" variant="outline">
                <Maximize2 className="h-3 w-3" />
                Expand
              </Button>
            )}
          </div>
        </div>
        <div
          className={
            isFlexHeight
              ? 'min-h-0 flex-1 overflow-hidden rounded-t-none border-0'
              : 'overflow-hidden rounded-t-none border-0'
          }
          style={isFlexHeight ? undefined : { height }}
        >
          <YamlEditor onChange={(val) => onChange(val || '')} options={options} value={value} />
        </div>
      </div>
    </div>
  );
};
