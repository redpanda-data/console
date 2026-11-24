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

import { InfoIcon, WarningIcon } from 'components/icons';
import type React from 'react';

import { type PreviewDisplayMode, renderPreviewTags } from './preview-tags-text';
import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import type { PreviewTagV2 } from '../../../../../state/ui';
import { cullText, prettyBytes } from '../../../../../utils/utils';
import { EmptyBadge } from '../common/empty-badge';

function isEmptyValue(value: Payload) {
  return (
    value.encoding === 'null' ||
    value.payload === null ||
    (typeof value.payload === 'string' && value.payload.length === 0)
  );
}

function isPrimitivePayload(payload: unknown) {
  return typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean';
}

function getValuePreviewText(msg: TopicMessage) {
  if (msg.value.encoding === 'binary') {
    return msg.valueBinHexPreview as React.ReactNode;
  }
  if (isPrimitivePayload(msg.value.payload)) {
    return msg.value.payload as React.ReactNode;
  }
  return cullText(msg.valueJson, 300);
}

function renderValuePreview(
  msg: TopicMessage,
  previewFields: () => PreviewTagV2[],
  previewDisplayMode: PreviewDisplayMode | undefined
) {
  const value = msg.value;
  if (value.isPayloadNull) {
    return <EmptyBadge mode="null" />;
  }
  if (isEmptyValue(value)) {
    return <EmptyBadge mode="empty" />;
  }

  const isObject = !(value.encoding === 'binary' || isPrimitivePayload(value.payload));
  const tagsPreview = isObject ? renderPreviewTags(value.payload, previewFields, previewDisplayMode) : null;
  if (tagsPreview) {
    return tagsPreview;
  }

  return (
    <div className="flex flex-col">
      <code>
        <span className="cellDiv" style={{ fontSize: '95%' }}>
          {getValuePreviewText(msg)}
        </span>
      </code>
      <span className="text-muted-foreground">
        {value.encoding?.toUpperCase() || 'UNKNOWN'} - {prettyBytes(value.size)}
      </span>
    </div>
  );
}

export const MessagePreview = ({
  msg,
  previewFields,
  isCompactTopic: _isCompactTopic,
  previewDisplayMode,
}: {
  msg: TopicMessage;
  previewFields: () => PreviewTagV2[];
  isCompactTopic: boolean;
  previewDisplayMode?: PreviewDisplayMode;
}) => {
  const value = msg.value;

  if (value.troubleshootReport && value.troubleshootReport.length > 0) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <WarningIcon size={24} />
        There were issues deserializing the value
      </div>
    );
  }

  if (value.isPayloadTooLarge) {
    return (
      <div className="flex items-center gap-2 text-informative">
        <InfoIcon size={24} />
        Message size exceeds the display limit.
      </div>
    );
  }

  try {
    return renderValuePreview(msg, previewFields, previewDisplayMode);
  } catch (e) {
    return <span className="text-destructive">Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
  }
};
