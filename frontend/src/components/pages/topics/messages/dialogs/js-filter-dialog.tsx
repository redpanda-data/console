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
import { useMemo, useState } from 'react';

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { createFilterEntry, type FilterEntry } from '../../../../../state/ui';
import { wrapFilterFragment } from '../../../../../utils/filter-helper';
import FilterEditor from '../../Tab.Messages/editor';

const EXAMPLES: { code: string; note: string }[] = [
  { code: 'value != null', note: 'skips records without value' },
  { code: "if (key == 'example') return true", note: "only messages whose key equals 'example' (after decoding)" },
  { code: 'value.version === 0', note: 'matches records whose value version is 0' },
  { code: 'offset % 2 === 0', note: 'keeps only even offsets' },
];

const PREVIEW_LIMIT = 4;

type PreviewResult =
  | { state: 'empty-code' }
  | { state: 'error'; message: string }
  | { state: 'ok'; hits: TopicMessage[]; hitCount: number; total: number };

/**
 * Run the transpiled predicate over the loaded rows. Same trust model as the
 * backend execution: it's the user's own code running on their own data.
 */
const runPreview = (transpiledCode: string, messages: TopicMessage[]): PreviewResult => {
  if (!transpiledCode.trim()) {
    return { state: 'empty-code' };
  }
  try {
    // biome-ignore lint/security/noGlobalEval: predicate authored by the user, mirrors backend filter execution
    const fn = new Function(
      'offset',
      'partitionID',
      'key',
      'value',
      'headers',
      'keySchemaID',
      'valueSchemaID',
      wrapFilterFragment(transpiledCode)
    );
    const hits: TopicMessage[] = [];
    let hitCount = 0;
    for (const msg of messages) {
      const headers = Object.fromEntries(msg.headers.map((h) => [h.key, h.value.payload]));
      const matched = fn(
        msg.offset,
        msg.partitionID,
        msg.key.isPayloadNull ? null : msg.key.payload,
        msg.value.isPayloadNull ? null : msg.value.payload,
        headers,
        msg.key.schemaId,
        msg.value.schemaId
      );
      if (matched) {
        hitCount += 1;
        if (hits.length < PREVIEW_LIMIT) {
          hits.push(msg);
        }
      }
    }
    return { state: 'ok', hits, hitCount, total: messages.length };
  } catch (err) {
    return { state: 'error', message: err instanceof Error ? err.message : String(err) };
  }
};

export type JsFilterDialogProps = {
  /** Filter being edited, or null to create a new one. */
  filter: FilterEntry | null;
  /** Code seeded from the filter bar (`js:` input), for new filters. */
  seedCode?: string;
  messages: TopicMessage[];
  onClose: () => void;
  onSave: (filter: FilterEntry) => void;
};

export const JsFilterDialog = ({ filter, seedCode, messages, onClose, onSave }: JsFilterDialogProps) => {
  const [draft, setDraft] = useState<FilterEntry>(
    () => filter ?? createFilterEntry({ code: seedCode ?? 'return true', transpiledCode: seedCode ?? 'return true' })
  );

  const preview = useMemo(() => runPreview(draft.transpiledCode, messages), [draft.transpiledCode, messages]);

  const apply = () => {
    if (preview.state === 'error') {
      return;
    }
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
            <div
              className={`overflow-hidden rounded-md border ${preview.state === 'error' ? 'border-destructive' : ''}`}
            >
              <FilterEditor
                onValueChange={(code, transpiled) =>
                  setDraft((prev) => ({ ...prev, code, transpiledCode: transpiled }))
                }
                value={draft.code}
              />
            </div>
            {preview.state === 'error' && (
              <div className="font-mono text-destructive text-xs" data-testid="js-filter-error">
                ⚠ {preview.message}
              </div>
            )}
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

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Preview</Label>
              <span className="font-mono text-muted-foreground text-xs" data-testid="js-filter-preview-info">
                {preview.state === 'ok' &&
                  (preview.total === 0
                    ? 'no rows loaded to preview'
                    : `${preview.hitCount} of ${preview.total} loaded match`)}
                {preview.state === 'empty-code' && 'offset, partitionID, key, value, headers in scope'}
                {preview.state === 'error' && '⚠ fix the code to preview'}
              </span>
            </div>
            {preview.state === 'ok' && preview.hits.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                {preview.hits.map((msg) => (
                  <div
                    className="flex items-center gap-2.5 border-b px-3 py-1.5 text-xs last:border-b-0"
                    key={`${msg.partitionID}-${msg.offset}`}
                  >
                    <span className="shrink-0 font-mono text-muted-foreground">{msg.offset}</span>
                    <span className="shrink-0 font-mono text-primary">
                      {msg.keyJson.length > 12 ? `${msg.keyJson.slice(0, 12)}…` : msg.keyJson}
                    </span>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">{msg.valueJson}</span>
                  </div>
                ))}
                {preview.hitCount > preview.hits.length && (
                  <div className="bg-muted px-3 py-1.5 font-mono text-muted-foreground text-xs">
                    + {preview.hitCount - preview.hits.length} more
                  </div>
                )}
              </div>
            )}
            {preview.state === 'ok' && preview.total === 0 && (
              <div className="rounded-md border border-dashed px-4 py-3 text-center text-muted-foreground text-xs">
                Nothing loaded to preview against — the preview runs over the rows currently in the table. The filter
                still applies on the broker when you apply it.
              </div>
            )}
            {preview.state === 'ok' && preview.total > 0 && preview.hitCount === 0 && (
              <div className="rounded-md border border-dashed px-4 py-3 text-center text-muted-foreground text-xs">
                No loaded records match this predicate.
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <span className="mr-auto text-muted-foreground text-xs">
            <Kbd>⌘⏎</Kbd> apply
          </span>
          <Button onClick={onClose} testId="js-filter-cancel" variant="outline">
            Cancel
          </Button>
          <Button disabled={preview.state === 'error'} onClick={apply} testId="js-filter-apply">
            Apply filter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
