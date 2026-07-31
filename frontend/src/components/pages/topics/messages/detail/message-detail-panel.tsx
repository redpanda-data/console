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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from 'components/redpanda-ui/components/sheet';
import { cn } from 'components/redpanda-ui/lib/utils';
import { DownloadIcon, Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { HeadersSection, KeySection, MetadataSection, ValueSection } from './detail-sections';
import { type DetailSectionKey, patchDetailViewState, readDetailViewState } from './detail-view-state';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { toJson } from '../../../../../utils/json-utils';

export type MessageDetailPanelProps = {
  msg: TopicMessage;
  onClose: () => void;
  loadLargeMessage: () => Promise<void>;
  /** Controlled: whether the full-height sheet presentation is shown. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

/** Builds the record download exactly like the design mock: record-p{partition}-o{offset}.json */
export const downloadRecord = (msg: TopicMessage) => {
  const record = {
    partition: msg.partitionID,
    offset: msg.offset,
    timestamp: msg.timestamp,
    key: msg.key.isPayloadNull ? null : msg.key.payload,
    value: msg.value.isPayloadNull ? null : msg.value.payload,
    headers: msg.headers.map((h) => ({ key: h.key, value: h.value.payload })),
    compression: msg.compression,
    transactional: msg.isTransactional,
  };
  const blob = new Blob([toJson(record, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `record-p${msg.partitionID}-o${msg.offset}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

const DetailBody = ({
  msg,
  loadLargeMessage,
  fillValue,
  sections,
  onSectionOpenChange,
}: {
  msg: TopicMessage;
  loadLargeMessage: () => Promise<void>;
  /** Expanded sheet: the value section stretches to use the full remaining height. */
  fillValue?: boolean;
  sections: Record<DetailSectionKey, boolean>;
  onSectionOpenChange: (section: DetailSectionKey, open: boolean) => void;
}) => (
  <>
    <div className={cn('min-h-0 flex-1 overflow-y-auto', fillValue && 'flex flex-col')}>
      <MetadataSection
        msg={msg}
        onOpenChange={(open) => onSectionOpenChange('metadata', open)}
        open={sections.metadata}
      />
      <KeySection msg={msg} onOpenChange={(open) => onSectionOpenChange('key', open)} open={sections.key} />
      <HeadersSection msg={msg} onOpenChange={(open) => onSectionOpenChange('headers', open)} open={sections.headers} />
      <ValueSection
        fill={fillValue}
        loadLargeMessage={loadLargeMessage}
        msg={msg}
        onOpenChange={(open) => onSectionOpenChange('value', open)}
        open={sections.value}
      />
    </div>
    <div className="flex shrink-0 justify-end border-t px-3 py-2">
      <Button onClick={() => downloadRecord(msg)} size="sm" testId="detail-download-record" variant="outline">
        <DownloadIcon className="size-4" />
        Download Record
      </Button>
    </div>
  </>
);

/**
 * Message inspector: docked next to the table, or (controlled via `expanded`)
 * a full-height sheet. Only one presentation renders at a time — the page
 * unmounts the docked resizable slot while the sheet is open.
 */
export const MessageDetailPanel = ({
  msg,
  onClose,
  loadLargeMessage,
  expanded,
  onExpandedChange,
}: MessageDetailPanelProps) => {
  const [sheetWidth, setSheetWidth] = useState(() =>
    Math.min(Math.max(480, readDetailViewState().sheetWidth), window.innerWidth - 80)
  );

  // Section expansion is shared across messages and both presentations; every
  // toggle persists into the consolidated detail view state.
  const [sections, setSections] = useState(() => readDetailViewState().sections);
  const handleSectionOpenChange = (section: DetailSectionKey, open: boolean) => {
    setSections((prev) => {
      const next = { ...prev, [section]: open };
      patchDetailViewState({ sections: next });
      return next;
    });
  };

  const startSheetResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sheetWidth;
    let latestWidth = startWidth;
    const onMove = (event: PointerEvent) => {
      latestWidth = Math.min(Math.max(480, startWidth + (startX - event.clientX)), window.innerWidth - 80);
      setSheetWidth(latestWidth);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      patchDetailViewState({ sheetWidth: latestWidth });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  // Esc closes the panel (unless typing in an input; the sheet handles its own Esc)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === 'Escape' && !expanded && !/^(input|textarea|select)$/i.test(target.tagName)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded, onClose]);

  if (expanded) {
    return (
      // Non-modal + no pointer dismissal: the table stays interactive while
      // expanded, so clicking another row swaps the record shown in place.
      <Sheet disablePointerDismissal modal={false} onOpenChange={onExpandedChange} open>
        <SheetContent
          className="flex max-w-[95vw] flex-col gap-0 p-0 sm:max-w-[95vw]"
          showCloseButton={false}
          showOverlay={false}
          side="right"
          style={{ width: sheetWidth }}
        >
          <div
            className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40"
            data-testid="detail-sheet-resize"
            onPointerDown={startSheetResize}
            title="Drag to resize"
          />
          <SheetHeader className="shrink-0 flex-row items-center gap-1 border-b px-4 py-2.5">
            <SheetTitle className="min-w-0 flex-1 font-semibold text-[13px]">Message</SheetTitle>
            <Button
              onClick={() => onExpandedChange(false)}
              size="icon-xs"
              testId="detail-collapse"
              title="Collapse back to panel"
              variant="secondary-ghost"
            >
              <Minimize2Icon />
            </Button>
            <Button
              onClick={onClose}
              size="icon-xs"
              testId="detail-sheet-close"
              title="Close"
              variant="secondary-ghost"
            >
              <XIcon />
            </Button>
          </SheetHeader>
          <DetailBody
            fillValue
            loadLargeMessage={loadLargeMessage}
            msg={msg}
            onSectionOpenChange={handleSectionOpenChange}
            sections={sections}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-card" data-testid="message-detail-panel">
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <span className="min-w-0 flex-1 font-semibold text-[13px]">Message</span>
        <Button
          onClick={() => onExpandedChange(true)}
          size="icon-xs"
          testId="detail-expand"
          title="Expand"
          variant="secondary-ghost"
        >
          <Maximize2Icon />
        </Button>
        <Button onClick={onClose} size="icon-xs" testId="detail-close" title="Close" variant="secondary-ghost">
          <XIcon />
        </Button>
      </div>
      <DetailBody
        loadLargeMessage={loadLargeMessage}
        msg={msg}
        onSectionOpenChange={handleSectionOpenChange}
        sections={sections}
      />
    </div>
  );
};
