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
import { Label } from 'components/redpanda-ui/components/label';
import { InlineCode, List, ListItem } from 'components/redpanda-ui/components/typography';
import type { FC } from 'react';
import { useState } from 'react';

import FilterEditor from './editor';
import type { FilterEntry } from '../../../../state/ui';

const JavascriptFilterModal: FC<{
  currentFilter: FilterEntry;
  onClose: () => void;
  onSave: (filter: FilterEntry) => void;
}> = ({ currentFilter, onClose, onSave }) => {
  const [filter, setFilter] = useState<FilterEntry>({ ...currentFilter });

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>JavaScript filtering</DialogTitle>
        </DialogHeader>
        <DialogBody spacing="lg">
          <div className="text-body text-muted-foreground">Write JavaScript code to filter your records.</div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-javascript-filter-name">Filter display name</Label>
            <Input
              data-testid="add-javascript-filter-name"
              id="add-javascript-filter-name"
              onChange={(e) => {
                setFilter((prev) => ({ ...prev, name: e.target.value }));
              }}
              placeholder="This name will appear in the filter bar"
              value={filter.name}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr]">
            <div className="flex flex-col gap-3">
              <Label htmlFor="add-javascript-filter-code">Filter code</Label>
              <div className="overflow-hidden rounded-md border">
                <FilterEditor
                  data-testid="add-javascript-filter-code"
                  onValueChange={(code, transpiled) => {
                    setFilter((prev) => ({ ...prev, code, transpiledCode: transpiled }));
                  }}
                  value={filter.code}
                />
              </div>

              <List>
                <ListItem>
                  <InlineCode>return true</InlineCode> allows messages, <InlineCode>return false</InlineCode> discards
                  them.
                </ListItem>
                <ListItem>
                  Available params are <InlineCode>offset</InlineCode>, <InlineCode>partitionID</InlineCode> (number),{' '}
                  <InlineCode>key</InlineCode> (any), <InlineCode>value</InlineCode> (any),{' '}
                  <InlineCode>headers</InlineCode> (object), <InlineCode>keySchemaID</InlineCode> (number) and{' '}
                  <InlineCode>valueSchemaID</InlineCode> (number).
                </ListItem>
                <ListItem>Multiple active filters are combined with 'and'.</ListItem>
              </List>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-heading-sm">Examples</h3>
              <List>
                <ListItem>
                  <InlineCode>value != null</InlineCode> skips records without value.
                </ListItem>
                <ListItem>
                  <InlineCode>if (key == 'example') return true</InlineCode> only returns messages where keys equal{' '}
                  <InlineCode>'example'</InlineCode> in their string presentation (after decoding).
                </ListItem>
              </List>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button data-testid="add-javascript-filter-close" onClick={() => onClose()} variant="outline">
            Close
          </Button>
          <Button
            data-testid="add-javascript-filter-save"
            onClick={() => {
              onSave(filter);
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JavascriptFilterModal;
