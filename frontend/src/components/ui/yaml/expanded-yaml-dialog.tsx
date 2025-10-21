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

// Form-based props (for create/edit with react-hook-form)
type FormBasedProps = {
  mode: 'form';
  form: UseFormReturn<FormValues>;
  toolIndex: number;
  toolName?: never;
  value?: never;
  onChange?: never;
  readOnly?: never;
};

// Direct value/onChange props (for viewing/editing without a form)
type DirectProps = {
  mode: 'direct';
  form?: never;
  toolIndex?: never;
  toolName: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
};

type CommonProps = {
  isOpen: boolean;
  lintHints: Record<string, LintHint>;
  isLintConfigPending: boolean;
  onClose: () => void;
  onLint: () => void;
};

type ExpandedYamlDialogProps = CommonProps & (FormBasedProps | DirectProps);

export const ExpandedYamlDialog: React.FC<ExpandedYamlDialogProps> = (props) => {
  const { isOpen, lintHints, isLintConfigPending, onClose, onLint } = props;

  // Determine values based on mode
  const title =
    props.mode === 'form'
      ? `YAML Configuration - Tool ${props.toolIndex + 1}${props.form.watch(`tools.${props.toolIndex}.name`) ? ` (${props.form.watch(`tools.${props.toolIndex}.name`)})` : ''}`
      : `YAML Configuration${props.toolName ? ` - ${props.toolName}` : ''}`;

  const value = props.mode === 'form' ? props.form.watch(`tools.${props.toolIndex}.config`) : props.value;

  const handleChange = (val: string) => {
    if (props.mode === 'form') {
      props.form.setValue(`tools.${props.toolIndex}.config`, val, {
        shouldDirty: true,
        shouldValidate: true,
      });
    } else {
      props.onChange(val);
    }
  };

  const configError = props.mode === 'form' ? props.form.formState.errors.tools?.[props.toolIndex]?.config : undefined;
  const readOnly = props.mode === 'direct' ? props.readOnly : false;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="flex h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw] flex-col p-0" size="full">
        <DialogHeader className="flex-shrink-0 px-6 pt-6">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-4">
            <YamlEditorCard
              height="100%"
              isLinting={isLintConfigPending}
              onChange={handleChange}
              onLint={readOnly ? undefined : onLint}
              options={{
                readOnly,
                theme: 'vs',
              }}
              showLint={!readOnly}
              value={value}
            />
          </div>

          {/* Display validation errors and lint hints below the editor */}
          {(configError || Object.keys(lintHints).length > 0) && (
            <div className="flex-shrink-0 space-y-2 pb-4">
              {configError && <div className="text-red-600 text-sm">{configError.message}</div>}

              {Object.keys(lintHints).length > 0 && <LintHintList lintHints={lintHints} />}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 px-6 pb-6">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
