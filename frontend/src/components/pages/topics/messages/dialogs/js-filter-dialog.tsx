/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { Kbd } from 'components/redpanda-ui/components/kbd';
import { Label } from 'components/redpanda-ui/components/label';
import { InlineCode } from 'components/redpanda-ui/components/typography';
import { useState } from 'react';

import { createFilterEntry, type FilterEntry } from '../../../../../state/ui';
import FilterEditor from '../../Tab.Messages/editor';

const EXAMPLES: { code: string; note: string }[] = [
  { code: 'value != null', note: 'skips records without value' },
  { code: "if (key == 'example') return true", note: "only messages whose key equals 'example' (after decoding)" },
  { code: 'value.version === 0', note: 'matches records whose value version is 0' },
  { code: 'offset % 2 === 0', note: 'keeps only even offsets' },
];

export type JsFilterDialogProps = {
  /** Filter being edited, or null to create a new one. */
  filter: FilterEntry | null;
  /** Code seeded from the filter bar (`js:` input), for new filters. */
  seedCode?: string;
  onClose: () => void;
  onSave: (filter: FilterEntry) => void;
};

export const JsFilterDialog = ({ filter, seedCode, onClose, onSave }: JsFilterDialogProps) => {
  const [draft, setDraft] = useState<FilterEntry>(
    () => filter ?? createFilterEntry({ code: seedCode ?? 'return true', transpiledCode: seedCode ?? 'return true' })
  );

  const apply = () => {
    onSave({ ...draft, isActive: true });
    onClose();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            apply();
          }
        }}
        size="xl"
      >
        <DialogHeader>
          <DialogTitle>JavaScript filtering</DialogTitle>
        </DialogHeader>
        <DialogBody spacing="lg">
          <div className="text-muted-foreground text-sm">
            <InlineCode>return true</InlineCode> allows messages, <InlineCode>return false</InlineCode> discards them.
            Available params: <InlineCode>offset</InlineCode>, <InlineCode>partitionID</InlineCode>,{' '}
            <InlineCode>key</InlineCode>, <InlineCode>value</InlineCode>, <InlineCode>headers</InlineCode>,{' '}
            <InlineCode>keySchemaID</InlineCode>, <InlineCode>valueSchemaID</InlineCode>. Multiple active filters are
            combined with <InlineCode>and</InlineCode>.
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="js-filter-name">
              Filter name <span className="font-normal text-muted-foreground">— optional</span>
            </Label>
            <Input
              id="js-filter-name"
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Invoices missing zip"
              testId="js-filter-name"
              value={draft.name}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Filter code</Label>
            <div className="overflow-hidden rounded-md border">
              <FilterEditor
                onValueChange={(code, transpiled) =>
                  setDraft((prev) => ({ ...prev, code, transpiledCode: transpiled }))
                }
                value={draft.code}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Examples</Label>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  className="whitespace-nowrap rounded-md border bg-background px-2.5 py-1 font-mono text-xs hover:bg-muted"
                  key={example.code}
                  onClick={() => setDraft((prev) => ({ ...prev, code: example.code, transpiledCode: example.code }))}
                  title={example.note}
                  type="button"
                >
                  {example.code}
                </button>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-muted-foreground text-xs">
            <Kbd>⌘⏎</Kbd> apply
          </span>
          <Button onClick={onClose} testId="js-filter-cancel" variant="outline">
            Cancel
          </Button>
          <Button onClick={apply} testId="js-filter-apply">
            Apply filter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
