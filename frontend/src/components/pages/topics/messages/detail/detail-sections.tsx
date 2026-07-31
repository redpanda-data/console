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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertTriangleIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Payload, TopicMessage } from '../../../../../state/rest-interfaces';
import { TimestampDisplay } from '../../../../../utils/tsx-utils';
import { prettyBytes } from '../../../../../utils/utils';
import { PayloadComponent } from '../../Tab.Messages/message-display/payload-component';

/** Collapsible section with an uppercase label, optional right-side meta and copy action.
 * Open state is controlled — it lives in the persisted detail view state. */
const DetailSection = ({
  label,
  open,
  onOpenChange,
  meta,
  copyContent,
  children,
  testId,
  fill,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta?: string;
  copyContent?: string;
  children: ReactNode;
  testId: string;
  /** Stretch this section to fill the remaining panel height while open. */
  fill?: boolean;
}) => (
  <Collapsible
    className={cn('shrink-0 border-b px-3 py-2.5 last:border-b-0', fill && open && 'flex min-h-0 flex-1 flex-col')}
    onOpenChange={onOpenChange}
    open={open}
    testId={testId}
  >
    <div className="flex items-center justify-between gap-2">
      <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-1.5">
        <ChevronRightIcon
          className={`size-3 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="font-semibold text-[10.5px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </CollapsibleTrigger>
      <div className="flex items-center gap-2">
        {meta && <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{meta}</span>}
        {copyContent !== undefined && <CopyButton className="size-6" content={copyContent} size="sm" variant="ghost" />}
      </div>
    </div>
    <CollapsibleContent className={fill ? 'min-h-0 flex-1' : undefined}>
      <div className={cn('pt-1.5', fill && 'flex h-full flex-col')}>{children}</div>
    </CollapsibleContent>
  </Collapsible>
);

const MetaRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[minmax(110px,42%)_1fr] border-b last:border-b-0">
    <div className="px-2.5 py-1.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    <div className="min-w-0 break-all border-l px-2.5 py-1.5 font-mono text-xs">{children}</div>
  </div>
);

/** Controlled open state, persisted in the detail view state object. */
type SectionProps = {
  msg: TopicMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const MetadataSection = ({ msg, open, onOpenChange }: SectionProps) => (
  <DetailSection label="Metadata" onOpenChange={onOpenChange} open={open} testId="detail-metadata-section">
    <div className="overflow-hidden rounded-md border bg-card">
      <MetaRow label="Timestamp">
        <TimestampDisplay format="default" unixEpochMillisecond={msg.timestamp} />
      </MetaRow>
      <MetaRow label="Partition">{msg.partitionID}</MetaRow>
      <MetaRow label="Offset">{msg.offset.toLocaleString()}</MetaRow>
      <MetaRow label="Headers">{msg.headers.length}</MetaRow>
      <MetaRow label="Compression">
        <Badge className="font-mono" size="sm" tone="neutral" variant="subtle">
          {msg.compression}
        </Badge>
      </MetaRow>
      <MetaRow label="Transactional">{msg.isTransactional ? 'true' : 'false'}</MetaRow>
      <MetaRow label="Key size">{prettyBytes(msg.key.size)}</MetaRow>
      <MetaRow label="Value size">{prettyBytes(msg.value.size)}</MetaRow>
    </div>
  </DetailSection>
);

const payloadMeta = (payload: Payload) => `${String(payload.encoding).toUpperCase()} – ${prettyBytes(payload.size)}`;

/** Compact deserialization-failure report (e.g. a forced Protobuf decoder on text payloads). */
const TroubleshootNote = ({ payload }: { payload: Payload }) => {
  const report = payload.troubleshootReport;
  if (!report || report.length === 0) {
    return null;
  }
  return (
    <div className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-destructive text-xs">
        <AlertTriangleIcon className="size-3.5 shrink-0" />
        Errors were encountered when deserializing this payload
      </div>
      <div className="flex flex-col gap-1">
        {report.map((entry) => (
          <div className="break-words font-mono text-[11px] leading-relaxed" key={entry.serdeName}>
            <span className="font-semibold capitalize">{entry.serdeName}:</span> {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
};

const payloadCopyText = (payload: Payload, json: string) => {
  if (payload.isPayloadNull) {
    return 'null';
  }
  return json;
};

export const KeySection = ({ msg, open, onOpenChange }: SectionProps) => (
  <DetailSection
    copyContent={payloadCopyText(msg.key, msg.keyJson)}
    label="Key"
    meta={payloadMeta(msg.key)}
    onOpenChange={onOpenChange}
    open={open}
    testId="detail-key-section"
  >
    <div className="break-all rounded-md border bg-muted px-2.5 py-1.5 font-mono text-[12.5px]">
      {msg.key.isPayloadNull ? <span className="text-muted-foreground italic">null</span> : msg.keyJson}
    </div>
    <TroubleshootNote payload={msg.key} />
  </DetailSection>
);

const headerValueText = (value: Payload) => {
  if (value.isPayloadNull) {
    return null;
  }
  return typeof value.payload === 'object' ? JSON.stringify(value.payload) : String(value.payload);
};

/** Compact key/value grid (the design mock's header list — no table chrome or pagination). */
const HeaderGrid = ({ headers }: { headers: TopicMessage['headers'] }) => (
  <div className="overflow-hidden rounded-md border bg-card">
    <div className="grid grid-cols-[minmax(110px,42%)_1fr] border-b">
      <div className="px-2.5 py-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">Key</div>
      <div className="border-l px-2.5 py-1 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
        Value
      </div>
    </div>
    {headers.map((header, i) => {
      const text = headerValueText(header.value);
      return (
        <div
          className="grid grid-cols-[minmax(110px,42%)_1fr] border-b font-mono text-xs last:border-b-0"
          // biome-ignore lint/suspicious/noArrayIndexKey: header keys can repeat; order is stable
          key={`${header.key}-${i}`}
        >
          <div className="min-w-0 break-all px-2.5 py-1.5 text-primary">{header.key}</div>
          <div className="min-w-0 break-all border-l px-2.5 py-1.5">
            {text === null ? <span className="text-muted-foreground italic">null</span> : text}
          </div>
        </div>
      );
    })}
  </div>
);

export const HeadersSection = ({ msg, open, onOpenChange }: SectionProps) => (
  <DetailSection
    copyContent={msg.headers.length > 0 ? JSON.stringify(msg.headers, null, 2) : undefined}
    label="Headers"
    meta={msg.headers.length === 1 ? '1 header' : `${msg.headers.length} headers`}
    onOpenChange={onOpenChange}
    open={open}
    testId="detail-headers-section"
  >
    {msg.headers.length > 0 ? (
      <HeaderGrid headers={msg.headers} />
    ) : (
      <div className="py-2 text-muted-foreground text-xs">This record carries no headers.</div>
    )}
  </DetailSection>
);

export const ValueSection = ({
  msg,
  loadLargeMessage,
  fill,
  open,
  onOpenChange,
}: SectionProps & {
  loadLargeMessage: () => Promise<void>;
  /** Stretch the value viewer to the remaining panel height (expanded sheet). */
  fill?: boolean;
}) => (
  <DetailSection
    copyContent={payloadCopyText(msg.value, msg.valueJson)}
    fill={fill}
    label="Value"
    meta={payloadMeta(msg.value)}
    onOpenChange={onOpenChange}
    open={open}
    testId="detail-value-section"
  >
    <div className={cn('font-mono text-[12.5px] leading-relaxed', fill && 'min-h-0 flex-1')}>
      <PayloadComponent
        loadLargeMessage={loadLargeMessage}
        payload={msg.value}
        viewerStyle={fill ? { height: '100%', maxHeight: 'none' } : undefined}
      />
    </div>
    <TroubleshootNote payload={msg.value} />
  </DetailSection>
);
