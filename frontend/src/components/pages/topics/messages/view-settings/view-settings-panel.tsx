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
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { XIcon } from 'lucide-react';

import { ColumnList } from './column-list';
import { PreviewFieldsEditor } from './preview-fields-editor';
import type { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { TimestampDisplayFormat } from '../../../../../state/ui';
import { useTopicSettingsStore } from '../../../../../stores/topic-settings-store';
import { PAYLOAD_ENCODING_LABELS, PAYLOAD_ENCODING_PAIRS } from '../constants';
import type { MessageColumnConfig } from '../types';

const TS_FORMATS: { value: TimestampDisplayFormat; label: string }[] = [
  { value: 'default', label: 'Local DateTime' },
  { value: 'unixTimestamp', label: 'Unix Seconds' },
  { value: 'relative', label: 'Relative' },
  { value: 'onlyDate', label: 'Local Date' },
  { value: 'onlyTime', label: 'Local Time' },
  { value: 'unixMillis', label: 'Unix Millis' },
];

const DeserializerSelect = ({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: PayloadEncoding;
  onChange: (encoding: PayloadEncoding) => void;
  disabled?: boolean;
}) => (
  <Select disabled={disabled} onValueChange={(v) => onChange(Number(v) as PayloadEncoding)} value={String(value)}>
    <SelectTrigger className="w-full" testId={id} title={disabled ? 'Stop live tail to change this' : undefined}>
      <SelectValue>
        {(v: unknown) => PAYLOAD_ENCODING_PAIRS.find((p) => String(p.value) === String(v))?.label}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {PAYLOAD_ENCODING_PAIRS.map((pair) => (
        <SelectItem key={pair.value} value={String(pair.value)}>
          {pair.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export type ViewSettingsPanelProps = {
  topicName: string;
  onClose: () => void;
  keyDeserializer: PayloadEncoding;
  onKeyDeserializerChange: (encoding: PayloadEncoding) => void;
  valueDeserializer: PayloadEncoding;
  onValueDeserializerChange: (encoding: PayloadEncoding) => void;
  onResetDeserializers: () => void;
  /** Dotted paths seen in loaded values — autocomplete hints for preview patterns. */
  valuePathHints: string[];
  /** Deserializer changes only take effect on the next (re)start — disable them while streaming. */
  liveTail: boolean;
};

/**
 * Docked "View settings" panel (shares the right dock slot with the message
 * detail panel). Every change applies to the table instantly.
 */
export const ViewSettingsPanel = ({
  topicName,
  onClose,
  keyDeserializer,
  onKeyDeserializerChange,
  valueDeserializer,
  onValueDeserializerChange,
  onResetDeserializers,
  valuePathHints,
  liveTail,
}: ViewSettingsPanelProps) => {
  const {
    getRowDensity,
    setRowDensity,
    getMessageColumns,
    setMessageColumns,
    getTopicSettings,
    setTopicSettings,
    resetViewSettings,
  } = useTopicSettingsStore();

  const density = getRowDensity(topicName);
  const columns = getMessageColumns(topicName);
  const tsFormat = getTopicSettings(topicName)?.previewTimestamps ?? 'default';

  const configSummary = (columnId: MessageColumnConfig['id']): string => {
    switch (columnId) {
      case 'timestamp':
        return TS_FORMATS.find((f) => f.value === tsFormat)?.label ?? 'Local DateTime';
      case 'key':
        return PAYLOAD_ENCODING_LABELS[keyDeserializer];
      case 'value':
        return PAYLOAD_ENCODING_LABELS[valueDeserializer];
      default:
        return '';
    }
  };

  const renderConfig = (columnId: MessageColumnConfig['id']) => {
    switch (columnId) {
      case 'timestamp':
        return (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] uppercase tracking-wide">Display format</Label>
            <Select
              onValueChange={(v) => setTopicSettings(topicName, { previewTimestamps: v as TimestampDisplayFormat })}
              value={tsFormat}
            >
              <SelectTrigger className="w-full" testId="view-settings-ts-format">
                <SelectValue>{(v: unknown) => TS_FORMATS.find((f) => f.value === v)?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TS_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'key':
        return (
          <div className="flex flex-col gap-1.5">
            <Label className="text-[10px] uppercase tracking-wide">Deserializer</Label>
            <DeserializerSelect
              disabled={liveTail}
              id="view-settings-key-deser"
              onChange={onKeyDeserializerChange}
              value={keyDeserializer}
            />
            <p className="text-muted-foreground text-xs leading-relaxed">
              How key bytes are decoded for display. <span className="font-mono">Automatic</span> detects the format.
            </p>
          </div>
        );
      case 'value':
        return (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[10px] uppercase tracking-wide">Deserializer</Label>
              <DeserializerSelect
                disabled={liveTail}
                id="view-settings-value-deser"
                onChange={onValueDeserializerChange}
                value={valueDeserializer}
              />
            </div>
            <PreviewFieldsEditor topicName={topicName} valuePathHints={valuePathHints} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card" data-testid="view-settings-panel">
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15px]">View settings</div>
          <div className="text-muted-foreground text-xs">Changes apply to the table instantly</div>
        </div>
        <Button className="size-7" onClick={onClose} size="icon" testId="view-settings-close" variant="ghost">
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b px-4 py-3.5">
          <div className="mb-2 font-semibold text-sm">Row density</div>
          <ToggleGroup
            className="w-full"
            onValueChange={(next: string[]) => {
              if (next.length > 0) {
                setRowDensity(topicName, next[0] as 'compact' | 'detailed');
              }
            }}
            size="sm"
            value={[density]}
          >
            <ToggleGroupItem className="flex-1" testId="view-settings-density-compact" value="compact">
              Compact
            </ToggleGroupItem>
            <ToggleGroupItem className="flex-1" testId="view-settings-density-detailed" value="detailed">
              Detailed
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
            Detailed shows the decoder badge and byte size inline. Compact hides them for a denser table.
          </p>
        </div>

        <div className="px-4 py-3.5">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="font-semibold text-sm">Columns</div>
            <span className="text-muted-foreground text-xs">
              {columns.filter((c) => c.visible).length} of {columns.length}
            </span>
          </div>
          <p className="mb-2.5 text-muted-foreground text-xs leading-relaxed">
            Drag to reorder · toggle to show or hide. Configurable columns expose their decoder and display options.
          </p>
          <ColumnList
            columns={columns}
            configSummary={configSummary}
            onColumnsChange={(next) => setMessageColumns(topicName, next)}
            renderConfig={renderConfig}
          />
        </div>
      </div>

      <div className="shrink-0 border-t px-4 py-3">
        <Button
          className="w-full"
          onClick={() => {
            resetViewSettings(topicName);
            onResetDeserializers();
          }}
          size="sm"
          testId="view-settings-reset"
          variant="ghost"
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
};
