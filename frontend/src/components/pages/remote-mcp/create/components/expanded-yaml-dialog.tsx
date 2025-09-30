/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { YamlEditor } from 'components/misc/yaml-editor';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { Code, PencilRuler } from 'lucide-react';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import type { UseFormReturn } from 'react-hook-form';
import type { FormValues } from '../schemas';

interface ExpandedYamlDialogProps {
  form: UseFormReturn<FormValues>;
  toolIndex: number;
  isOpen: boolean;
  lintHints: Record<string, LintHint>;
  isLintConfigPending: boolean;
  onClose: () => void;
  onLint: () => void;
}

export const ExpandedYamlDialog: React.FC<ExpandedYamlDialogProps> = ({
  form,
  toolIndex,
  isOpen,
  lintHints,
  isLintConfigPending,
  onClose,
  onLint,
}) => {
  const toolName = form.watch(`tools.${toolIndex}.name`);
  const configError = form.formState.errors.tools?.[toolIndex]?.config;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="full" className="max-h-[95vh] h-[95vh] flex flex-col max-w-[95vw] w-[95vw]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            YAML Configuration - Tool {toolIndex + 1}
            {toolName && ` (${toolName})`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="relative border rounded-lg flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 rounded-t-lg flex-shrink-0">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Code className="h-4 w-4" />
                YAML Configuration
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onLint}
                  disabled={isLintConfigPending}
                  className="h-7 px-2 text-xs gap-1"
                >
                  <PencilRuler className="h-3 w-3" />
                  {isLintConfigPending ? 'Linting...' : 'Lint'}
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 border-0 rounded-t-none overflow-hidden">
              <YamlEditor
                value={form.watch(`tools.${toolIndex}.config`)}
                onChange={(val) =>
                  form.setValue(`tools.${toolIndex}.config`, val || '', {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </div>
          </div>

          {/* Display validation errors and lint hints below the editor */}
          <div className="flex-shrink-0 mt-4 space-y-2">
            {configError && <div className="text-sm text-red-600">{configError.message}</div>}

            <LintHintList lintHints={lintHints} />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
