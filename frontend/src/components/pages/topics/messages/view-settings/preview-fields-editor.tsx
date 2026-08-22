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
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { Combobox } from 'components/redpanda-ui/components/combobox';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { XIcon } from 'lucide-react';
import { useMemo } from 'react';

import type { PreviewTagV2 } from '../../../../../state/ui';
import { useTopicSettingsStore } from '../../../../../stores/topic-settings-store';
import { randomId } from '../../../../../utils/utils';

const OptionRow = ({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) => (
  <div className="flex flex-col gap-1">
    <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    <ToggleGroup
      className="w-full"
      onValueChange={(next: string[]) => {
        if (next.length > 0) {
          onChange(next[0]);
        }
      }}
      size="sm"
      value={[value]}
    >
      {options.map((option) => (
        <ToggleGroupItem
          buttonProps={{ className: 'flex-1' }}
          className="w-full text-xs"
          key={option.value}
          value={option.value}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  </div>
);

/**
 * Preview fields for the Value column: glob patterns picked out of the decoded
 * value and shown as `path=value` chips instead of the raw JSON line.
 * Persists straight into the per-topic settings store (`previewTags` et al.).
 */
export const PreviewFieldsEditor = ({ topicName, valuePathHints }: { topicName: string; valuePathHints: string[] }) => {
  const {
    getPreviewTags,
    setPreviewTags,
    getPreviewTagsCaseSensitive,
    setPreviewTagsCaseSensitive,
    getPreviewMultiResultMode,
    setPreviewMultiResultMode,
    getPreviewDisplayMode,
    setPreviewDisplayMode,
  } = useTopicSettingsStore();

  const tags = getPreviewTags(topicName);
  const pathOptions = useMemo(() => valuePathHints.map((path) => ({ value: path, label: path })), [valuePathHints]);

  const updateTag = (id: string, patch: Partial<PreviewTagV2>) => {
    setPreviewTags(
      topicName,
      tags.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
          Preview fields
        </div>
        <p className="mb-2 text-muted-foreground text-xs leading-relaxed">
          Show only chosen fields from the value. Add glob patterns like{' '}
          <span className="font-mono text-foreground">address.*</span>.
        </p>
        <div className="flex flex-col gap-1.5">
          {tags.map((tag) => (
            <div className="flex items-center gap-2 rounded-md border px-2 py-1" key={tag.id}>
              <Checkbox
                checked={tag.isActive}
                onCheckedChange={(checked) => updateTag(tag.id, { isActive: checked === true })}
                testId={`preview-tag-toggle-${tag.id}`}
              />
              <Combobox
                className="min-w-0 flex-1"
                clearable={false}
                creatable
                createLabel="pattern"
                inputTestId={`preview-tag-pattern-${tag.id}`}
                onChange={(value) => updateTag(tag.id, { pattern: value })}
                onCreateOption={(value) => updateTag(tag.id, { pattern: value })}
                options={pathOptions}
                placeholder="field or glob"
                start={null}
                value={tag.pattern}
              />
              <button
                className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() =>
                  setPreviewTags(
                    topicName,
                    tags.filter((t) => t.id !== tag.id)
                  )
                }
                title="Remove"
                type="button"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button
          className="mt-1.5 w-full border-dashed"
          onClick={() =>
            setPreviewTags(topicName, [
              ...tags,
              {
                id: randomId(),
                isActive: true,
                pattern: '',
                searchInMessageHeaders: false,
                searchInMessageKey: false,
                searchInMessageValue: true,
              },
            ])
          }
          size="sm"
          testId="preview-tag-add"
          variant="outline"
        >
          Add field…
        </Button>
      </div>

      <OptionRow
        label="Matching"
        onChange={(v) => setPreviewTagsCaseSensitive(topicName, v as 'caseSensitive' | 'ignoreCase')}
        options={[
          { value: 'ignoreCase', label: 'Ignore case' },
          { value: 'caseSensitive', label: 'Case sensitive' },
        ]}
        value={getPreviewTagsCaseSensitive(topicName)}
      />
      <OptionRow
        label="Multiple results"
        onChange={(v) => setPreviewMultiResultMode(topicName, v as 'showOnlyFirst' | 'showAll')}
        options={[
          { value: 'showOnlyFirst', label: 'First result' },
          { value: 'showAll', label: 'Show all' },
        ]}
        value={getPreviewMultiResultMode(topicName)}
      />
      <OptionRow
        label="Wrapping"
        onChange={(v) => setPreviewDisplayMode(topicName, v as 'single' | 'wrap' | 'rows')}
        options={[
          { value: 'single', label: 'Single' },
          { value: 'wrap', label: 'Wrap' },
          { value: 'rows', label: 'Rows' },
        ]}
        value={getPreviewDisplayMode(topicName)}
      />
    </div>
  );
};
