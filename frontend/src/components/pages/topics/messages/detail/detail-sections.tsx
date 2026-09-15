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

import { AccordionContent, AccordionItem, AccordionTrigger } from 'components/redpanda-ui/components/accordion';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
import { cn } from 'components/redpanda-ui/lib/utils';
import { AlertTriangleIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Payload, TopicMessage } from 'state/rest-interfaces';
import { TimestampDisplay } from 'utils/tsx-utils';
import { prettyBytes } from 'utils/utils';

import type { DetailSectionKey } from './detail-view-state';
import { PayloadComponent } from '../../Tab.Messages/message-display/payload-component';

/** Accordion section with an uppercase label, optional right-side meta and copy action.
 * Open state is controlled by the parent `Accordion` root — it lives in the persisted detail view state. */
const DetailSection = ({
  label,
  value,
  open,
  meta,
  copyContent,
  children,
  testId,
  fill,
}: {
  label: string;
  /** Item value inside the parent `Accordion` root. */
  value: DetailSectionKey;
  /** Only needed by `fill` styling; toggling is handled by the accordion root. */
  open?: boolean;
  meta?: string;
  copyContent?: string;
  children: ReactNode;
  testId: string;
  /** Stretch this section to fill the remaining panel height while open. */
  fill?: boolean;
}) => (
  <AccordionItem
    className={cn(
      // `relative` anchors the copy button: it can't live in the trigger's `end` slot
      // (a button inside the trigger button), so it overlays the header row instead.
      'relative shrink-0 border-b px-3 py-2.5 last:border-b-0',
      fill && open && 'flex min-h-0 flex-1 flex-col',
      // The registry panel pins its height to the measured content height
      // (`h-(--accordion-panel-height)`); the fill presentation needs it to flex-stretch.
      fill &&
        open &&
        '[&>[data-slot=accordion-content]]:h-auto [&>[data-slot=accordion-content]]:min-h-0 [&>[data-slot=accordion-content]]:flex-1'
    )}
    testId={testId}
    value={value}
  >
    <AccordionTrigger
      chevron={false}
      className="select-none gap-1.5 py-0 no-underline hover:no-underline"
      end={
        meta ? (
          <span
            className={cn(
              'whitespace-nowrap font-mono text-caption text-muted-foreground',
              copyContent !== undefined && 'mr-7'
            )}
          >
            {meta}
          </span>
        ) : undefined
      }
      start={
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/accordion-trigger:rotate-90"
        />
      }
    >
      <span className="font-semibold text-caption text-muted-foreground uppercase tracking-wider">{label}</span>
    </AccordionTrigger>
    {copyContent !== undefined && (
      <CopyButton
        aria-label={`Copy ${label.toLowerCase()}`}
        className="absolute top-1.5 right-3 z-10 size-6"
        content={copyContent}
        size="sm"
        variant="ghost"
      />
    )}
    <AccordionContent className={cn('pt-1.5 pb-0', fill && 'flex h-full min-h-0 flex-col')}>
      {children}
    </AccordionContent>
  </AccordionItem>
);

const MetaRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[minmax(110px,42%)_1fr] border-b last:border-b-0">
    <dt className="px-2.5 py-1.5 font-semibold text-caption text-muted-foreground uppercase tracking-wide">{label}</dt>
    <dd className="min-w-0 break-all border-l px-2.5 py-1.5 font-mono text-body-sm">{children}</dd>
  </div>
);

/** Open state is controlled by the parent `Accordion` root, persisted in the detail view state object. */
type SectionProps = {
  msg: TopicMessage;
};

export const MetadataSection = ({ msg }: SectionProps) => (
  <DetailSection label="Metadata" testId="detail-metadata-section" value="metadata">
    <dl className="overflow-hidden rounded-md border bg-card">
      <MetaRow label="Timestamp">
        <TimestampDisplay format="default" unixEpochMillisecond={msg.timestamp} />
      </MetaRow>
      <MetaRow label="Partition">{msg.partitionID}</MetaRow>
      <MetaRow label="Offset">{msg.offset.toLocaleString()}</MetaRow>
      <MetaRow label="Headers">{msg.headers.length}</MetaRow>
      <MetaRow label="Compression">
        <Badge className="font-mono" size="sm" tone="default" variant="subtle">
          {msg.compression}
        </Badge>
      </MetaRow>
      <MetaRow label="Transactional">{msg.isTransactional ? 'true' : 'false'}</MetaRow>
      <MetaRow label="Key size">{prettyBytes(msg.key.size)}</MetaRow>
      <MetaRow label="Value size">{prettyBytes(msg.value.size)}</MetaRow>
    </dl>
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
    <Alert className="mt-1.5" icon={<AlertTriangleIcon aria-hidden="true" />} variant="destructive">
      <AlertTitle>Errors were encountered when deserializing this payload</AlertTitle>
      <AlertDescription>
        {report.map((entry) => (
          <div className="break-words font-mono text-body-sm leading-relaxed" key={entry.serdeName}>
            <span className="font-semibold capitalize">{entry.serdeName}:</span> {entry.message}
          </div>
        ))}
      </AlertDescription>
    </Alert>
  );
};

const payloadCopyText = (payload: Payload, json: string) => {
  if (payload.isPayloadNull) {
    return 'null';
  }
  return json;
};

export const KeySection = ({ msg }: SectionProps) => (
  <DetailSection
    copyContent={payloadCopyText(msg.key, msg.keyJson)}
    label="Key"
    meta={payloadMeta(msg.key)}
    testId="detail-key-section"
    value="key"
  >
    <div className="break-all rounded-md border bg-muted px-2.5 py-1.5 font-mono text-body-sm">
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

/** Compact key/value table (the design mock's header list — no table chrome or pagination). */
const HeaderGrid = ({ headers }: { headers: TopicMessage['headers'] }) => (
  <div className="overflow-hidden rounded-md border bg-card">
    <table className="w-full table-fixed border-collapse">
      <caption className="sr-only">Message headers</caption>
      <thead>
        <tr className="border-b">
          <th
            className="w-[42%] px-2.5 py-1 text-left font-semibold text-caption text-muted-foreground uppercase tracking-wide"
            scope="col"
          >
            Key
          </th>
          <th
            className="border-l px-2.5 py-1 text-left font-semibold text-caption text-muted-foreground uppercase tracking-wide"
            scope="col"
          >
            Value
          </th>
        </tr>
      </thead>
      <tbody>
        {headers.map((header, i) => {
          const text = headerValueText(header.value);
          return (
            <tr className="border-b font-mono text-body-sm last:border-b-0" key={`${header.key}-${i}`}>
              <td className="break-all px-2.5 py-1.5 align-top text-primary">{header.key}</td>
              <td className="break-all border-l px-2.5 py-1.5 align-top">
                {text === null ? <span className="sr-only">null</span> : <span>{text}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const HeadersSection = ({ msg }: SectionProps) => (
  <DetailSection
    copyContent={msg.headers.length > 0 ? JSON.stringify(msg.headers, null, 2) : undefined}
    label="Headers"
    meta={msg.headers.length === 1 ? '1 header' : `${msg.headers.length} headers`}
    testId="detail-headers-section"
    value="headers"
  >
    {msg.headers.length > 0 ? (
      <HeaderGrid headers={msg.headers} />
    ) : (
      <div className="py-2 text-body-sm text-muted-foreground">This record carries no headers.</div>
    )}
  </DetailSection>
);

export const ValueSection = ({
  msg,
  loadLargeMessage,
  fill,
  open,
}: SectionProps & {
  loadLargeMessage: () => Promise<void>;
  /** Stretch the value viewer to the remaining panel height (expanded sheet). */
  fill?: boolean;
  /** Only needed by `fill` styling; toggling is handled by the accordion root. */
  open?: boolean;
}) => (
  <DetailSection
    copyContent={payloadCopyText(msg.value, msg.valueJson)}
    fill={fill}
    label="Value"
    meta={payloadMeta(msg.value)}
    open={open}
    testId="detail-value-section"
    value="value"
  >
    <div className={cn('font-mono text-body-sm leading-relaxed', fill && 'min-h-0 flex-1')}>
      <PayloadComponent
        loadLargeMessage={loadLargeMessage}
        payload={msg.value}
        viewerStyle={fill ? { height: '100%', maxHeight: 'none' } : undefined}
      />
    </div>
    <TroubleshootNote payload={msg.value} />
  </DetailSection>
);
