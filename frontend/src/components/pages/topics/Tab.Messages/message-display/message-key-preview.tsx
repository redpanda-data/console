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

import { WarningIcon } from 'components/icons';
import type { ReactNode } from 'react';

import { highlightControlChars } from './highlight-control-chars';
import { type PreviewDisplayMode, renderPreviewTags } from './preview-tags-text';
import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import type { PreviewTagV2 } from '../../../../../state/ui';
import { cullText, prettyBytes } from '../../../../../utils/utils';
import { EmptyBadge } from '../common/empty-badge';

function isPrimitivePayload(payload: unknown): boolean {
  return typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean';
}

// Only 'object' is left after binary, control-character text, and primitives.
// Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
function isObjectKey(key: Payload): boolean {
  return !(key.encoding === 'binary' || key.encoding === 'utf8WithControlChars' || isPrimitivePayload(key.payload));
}

function getKeyPreviewText(msg: TopicMessage): ReactNode {
  const key = msg.key;
  if (key.encoding === 'binary') {
    return cullText(msg.keyBinHexPreview as string, 44);
  }
  if (key.encoding === 'utf8WithControlChars') {
    return highlightControlChars(key.payload as string);
  }
  if (isPrimitivePayload(key.payload)) {
    return cullText(key.payload as string, 44);
  }
  // Normal display (json, no filters). Reuse the cached JSON string.
  return cullText(msg.keyJson, 44);
}

function renderKeyPreview(
  msg: TopicMessage,
  previewFields: () => PreviewTagV2[],
  previewDisplayMode: PreviewDisplayMode | undefined
): ReactNode {
  const key = msg.key;
  if (key.isPayloadNull) {
    return <EmptyBadge mode="null" />;
  }
  if (key.payload === null || (typeof key.payload === 'string' && key.payload.length === 0)) {
    return <EmptyBadge mode="empty" />;
  }

  // Preview tags replace the whole cell for an object key.
  const tagsPreview = isObjectKey(key) ? renderPreviewTags(key.payload, previewFields, previewDisplayMode) : null;
  if (tagsPreview) {
    return tagsPreview;
  }

  return (
    <div className="flex flex-col">
      <span className="cellDiv" style={{ minWidth: '10ch', width: 'auto', maxWidth: '45ch' }}>
        <code style={{ fontSize: '95%' }}>{getKeyPreviewText(msg)}</code>
      </span>
      <span className="text-muted-foreground">
        {key.encoding?.toUpperCase() || 'UNKNOWN'} - {prettyBytes(key.size)}
      </span>
    </div>
  );
}

export const MessageKeyPreview = ({
  msg,
  previewFields,
  previewDisplayMode,
}: {
  msg: TopicMessage;
  previewFields: () => PreviewTagV2[];
  previewDisplayMode?: PreviewDisplayMode;
}) => {
  const key = msg.key;

  if (key.troubleshootReport && key.troubleshootReport.length > 0) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        {/* fontSize was inert on lucide icons, so master rendered these at 24. */}
        <WarningIcon size={24} />
        There were issues deserializing the key
      </div>
    );
  }

  try {
    return renderKeyPreview(msg, previewFields, previewDisplayMode);
  } catch (e) {
    return <span className="text-destructive">Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
  }
};
