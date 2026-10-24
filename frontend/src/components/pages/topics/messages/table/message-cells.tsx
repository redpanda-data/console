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

import clsx from 'clsx';
import { ElementTooltip } from 'components/misc/element-tooltip';
import { Badge } from 'components/redpanda-ui/components/badge';

import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import type { PreviewTagV2, TimestampDisplayFormat } from '../../../../../state/ui';
import { TimestampDisplay } from '../../../../../utils/tsx-utils';
import { prettyBytes } from '../../../../../utils/utils';
import { getPreviewTags } from '../../Tab.Messages/preview-settings';
import type { RowDensity } from '../types';

export type ValuePreviewConfig = {
  tags: PreviewTagV2[];
  caseSensitive: boolean;
  multiResultMode: 'showOnlyFirst' | 'showAll';
  displayMode: 'single' | 'wrap' | 'rows';
};

/** Max characters of the one-line JSON preview shown in key/value cells (mirrors the mock's ~92ch). */
const PREVIEW_MAX_CHARS = 92;

// The hover hint shows more than the cell without covering the table; the detail panel has the rest.
const PAYLOAD_HINT_MAX_CHARS = 300;

const truncate = (text: string, max = PREVIEW_MAX_CHARS) => (text.length > max ? `${text.slice(0, max)}…` : text);

export const OffsetCell = ({ offset }: { offset: number }) =>
  offset < 0 ? (
    <span className="text-muted-foreground">Loading…</span>
  ) : (
    <span className="font-mono text-body tabular-nums">{offset.toLocaleString()}</span>
  );

export const TimestampCell = ({ timestamp, format }: { timestamp: number; format: TimestampDisplayFormat }) => (
  <span className="whitespace-nowrap">
    <TimestampDisplay format={format} unixEpochMillisecond={timestamp} />
  </span>
);

export const SizeCell = ({ size }: { size: number }) => (
  <span className="font-mono text-body whitespace-nowrap text-muted-foreground">{prettyBytes(size)}</span>
);

type PayloadText = { text: string; muted: boolean; error?: boolean };

/** Payloads with nothing to preview inline: a null record, or one too large to have been fetched. */
const unavailablePayloadText = (payload: Payload): PayloadText | undefined => {
  if (payload.isPayloadNull) {
    return { text: 'null', muted: true };
  }
  if (payload.isPayloadTooLarge) {
    return { text: 'Payload too large to display — open the message to load it', muted: true };
  }
};

/** The best decoded form: JSON, then the hex preview, then a deserialization-failure hint. */
const decodedPayloadText = (payload: Payload, json: string, hexPreview: string): PayloadText => {
  if (json) {
    return { text: json, muted: false };
  }
  if (hexPreview) {
    return { text: hexPreview, muted: false };
  }
  if (payload.troubleshootReport && payload.troubleshootReport.length > 0) {
    return { text: '⚠ failed to deserialize — open the message for details', muted: false, error: true };
  }
  return { text: '', muted: true };
};

const payloadText = (payload: Payload, json: string, hexPreview: string): PayloadText =>
  unavailablePayloadText(payload) ?? decodedPayloadText(payload, json, hexPreview);

/**
 * Meta row shown under key/value content in `detailed` density:
 * the decoder badge and payload byte size, per the design mock.
 */
const PayloadMeta = ({ payload }: { payload: Payload }) => (
  <span className="mt-0.5 flex items-center gap-2">
    <Badge size="sm" tone="default" variant="subtle">
      {payload.encoding}
    </Badge>
    <span className="text-body-sm text-muted-foreground">{prettyBytes(payload.size)}</span>
  </span>
);

export const PayloadCell = ({
  payload,
  json,
  hexPreview,
  density,
  className,
}: {
  payload: Payload;
  json: string;
  hexPreview: string;
  density: RowDensity;
  className?: string;
}) => {
  const { text, muted, error } = payloadText(payload, json, hexPreview);
  return (
    <span className={clsx('flex min-w-0 flex-col', className ?? '')}>
      <ElementTooltip
        content={
          muted ? undefined : <span className="font-mono break-all">{truncate(text, PAYLOAD_HINT_MAX_CHARS)}</span>
        }
      >
        <span
          className={clsx(
            'block overflow-hidden font-mono text-body text-ellipsis whitespace-nowrap',
            muted ? 'text-muted-foreground italic' : '',
            error ? 'text-destructive' : ''
          )}
        >
          {truncate(text)}
        </span>
      </ElementTooltip>
      {density === 'detailed' && !payload.isPayloadNull && <PayloadMeta payload={payload} />}
    </span>
  );
};

export const KeyCell = ({ msg, density }: { msg: TopicMessage; density: RowDensity }) => (
  <PayloadCell
    className="max-w-[320px]"
    density={density}
    hexPreview={msg.keyBinHexPreview}
    json={msg.keyJson}
    payload={msg.key}
  />
);

export const ValueCell = ({
  msg,
  density,
  preview,
}: {
  msg: TopicMessage;
  density: RowDensity;
  preview?: ValuePreviewConfig;
}) => {
  const activeTags = preview?.tags.filter((t) => t.isActive && t.pattern.trim().length > 0 && t.searchInMessageValue);
  const payloadIsObject =
    !msg.value.isPayloadNull && typeof msg.value.payload === 'object' && msg.value.payload !== null;

  if (preview && activeTags && activeTags.length > 0 && payloadIsObject) {
    let chips = getPreviewTags(msg.value.payload as Record<string, unknown>, activeTags, preview.caseSensitive);
    if (preview.multiResultMode === 'showOnlyFirst') {
      chips = chips.slice(0, 1);
    }
    return (
      <span className="flex min-w-0 flex-col">
        <span
          className={clsx('previewTags font-mono text-body-sm', {
            'previewTags-single': preview.displayMode === 'single',
            'previewTags-wrap': preview.displayMode === 'wrap',
            'previewTags-rows': preview.displayMode === 'rows',
          })}
        >
          {chips.length > 0 ? chips : <span className="text-muted-foreground italic">no preview match</span>}
        </span>
        {density === 'detailed' && <PayloadMeta payload={msg.value} />}
      </span>
    );
  }

  return (
    <PayloadCell
      className="max-w-[640px]"
      density={density}
      hexPreview={msg.valueBinHexPreview}
      json={msg.valueJson}
      payload={msg.value}
    />
  );
};
