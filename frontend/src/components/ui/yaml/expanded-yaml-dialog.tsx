/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { FormValues } from 'components/pages/mcp-servers/create/schemas';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { LintHintList } from 'components/ui/lint-hint/lint-hint-list';
import { YamlEditorCard } from 'components/ui/yaml/yaml-editor-card';
import type { LintHint } from 'protogen/redpanda/api/common/v1/linthint_pb';
import type { UseFormReturn } from 'react-hook-form';

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
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-h-[95vh] h-[95vh] flex flex-col max-w-[95vw] w-[95vw]" size="full">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            YAML Configuration - Tool {toolIndex + 1}
            {toolName && ` (${toolName})`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 flex flex-col min-h-0">
            <YamlEditorCard
              height="100%"
              isLinting={isLintConfigPending}
              onChange={(val) =>
                form.setValue(`tools.${toolIndex}.config`, val, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              onLint={onLint}
              showLint
              value={form.watch(`tools.${toolIndex}.config`)}
            />
          </div>

          {/* Display validation errors and lint hints below the editor */}
          <div className="flex-shrink-0 mt-4 space-y-2">
            {configError && <div className="text-sm text-red-600">{configError.message}</div>}

            <LintHintList lintHints={lintHints} />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
