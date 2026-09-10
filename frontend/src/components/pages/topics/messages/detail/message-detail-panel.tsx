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

import { Accordion } from 'components/redpanda-ui/components/accordion';
import { Button } from 'components/redpanda-ui/components/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from 'components/redpanda-ui/components/resizable';
import { useHotKey } from 'hooks/use-hot-key';
import { DownloadIcon, Maximize2Icon, Minimize2Icon, XIcon } from 'lucide-react';
import { Fragment, type FragmentInstance, useEffect, useRef, useState } from 'react';
import type { PanelSize } from 'react-resizable-panels';
import type { TopicMessage } from 'state/rest-interfaces';
import { toJson } from 'utils/json-utils';

import { HeadersSection, KeySection, MetadataSection, ValueSection } from './detail-sections';
import { type DetailSectionKey, patchDetailViewState, readDetailViewState } from './detail-view-state';

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
  document.body.appendChild(link); // required in firefox
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const SECTION_KEYS: readonly DetailSectionKey[] = ['metadata', 'key', 'headers', 'value'];

function ExpandedMessageActions({ onCollapse, onClose }: { onCollapse: () => void; onClose: () => void }) {
  const actionsRef = useRef<FragmentInstance>(null);
  useEffect(function focusExpandedActions() {
    actionsRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Fragment ref={actionsRef}>
      <Button
        aria-label="Collapse back to panel"
        onClick={onCollapse}
        size="icon-xs"
        testId="detail-collapse"
        title="Collapse back to panel"
        variant="ghost"
      >
        <Minimize2Icon />
      </Button>
      <Button
        aria-label="Close"
        onClick={onClose}
        size="icon-xs"
        testId="detail-sheet-close"
        title="Close"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </Fragment>
  );
}

const DetailBody = ({
  msg,
  loadLargeMessage,
  fillValue,
  sections,
  onOpenSectionsChange,
}: {
  msg: TopicMessage;
  loadLargeMessage: () => Promise<void>;
  /** Expanded sheet: the value section stretches to use the full remaining height. */
  fillValue?: boolean;
  sections: Record<DetailSectionKey, boolean>;
  onOpenSectionsChange: (openSections: DetailSectionKey[]) => void;
}) => (
  <>
    <Accordion
      className="min-h-0 flex-1 overflow-y-auto"
      multiple
      onValueChange={(value) => onOpenSectionsChange(value as DetailSectionKey[])}
      value={SECTION_KEYS.filter((key) => sections[key])}
    >
      <MetadataSection msg={msg} />
      <KeySection msg={msg} />
      <HeadersSection msg={msg} />
      <ValueSection fill={fillValue} loadLargeMessage={loadLargeMessage} msg={msg} open={sections.value} />
    </Accordion>
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
 * a full-height resizable overlay. Only one presentation renders at a time —
 * the page unmounts the docked resizable slot while the overlay is open.
 */
export const MessageDetailPanel = ({
  msg,
  onClose,
  loadLargeMessage,
  expanded,
  onExpandedChange,
}: MessageDetailPanelProps) => {
  // Initial width for the expanded surface; live width is owned by the
  // resizable group and persisted from onResize.
  const [initialSheetWidth] = useState(() => readDetailViewState().sheetWidth);
  const handleSheetResize = (size: PanelSize) => patchDetailViewState({ sheetWidth: size.inPixels });

  // Section expansion is shared across messages and both presentations; every
  // toggle persists into the consolidated detail view state.
  const [sections, setSections] = useState(() => readDetailViewState().sections);
  const handleOpenSectionsChange = (openSections: DetailSectionKey[]) => {
    const next = {
      metadata: openSections.includes('metadata'),
      key: openSections.includes('key'),
      headers: openSections.includes('headers'),
      value: openSections.includes('value'),
    };
    patchDetailViewState({ sections: next });
    setSections(next);
  };

  // Esc: expanded collapses back to the docked panel, docked closes (unless typing in an input)
  useHotKey({
    key: 'Escape',
    ignoreWhenTyping: true,
    onTrigger: () => (expanded ? onExpandedChange(false) : onClose()),
  });

  if (expanded) {
    return (
      // Full-viewport overlay hosting a resizable split. The left panel is a
      // click-through spacer so the table underneath stays interactive
      // (clicking another row swaps the record shown in place); the right
      // panel is the detail surface, resized via the registry handle.
      <div className="pointer-events-none fixed inset-0 z-50">
        <ResizablePanelGroup>
          <ResizablePanel />
          <ResizableHandle className="pointer-events-auto" data-testid="detail-sheet-resize" withHandle />
          <ResizablePanel
            className="pointer-events-auto"
            defaultSize={initialSheetWidth}
            maxSize="95%"
            minSize="480px"
            onResize={handleSheetResize}
          >
            <div className="flex h-full min-h-0 flex-col bg-background shadow-lg" data-testid="message-detail-sheet">
              <div className="flex shrink-0 items-center gap-1 border-b px-4 py-2.5">
                <span className="min-w-0 flex-1 font-semibold text-label">Message</span>
                <ExpandedMessageActions onClose={onClose} onCollapse={() => onExpandedChange(false)} />
              </div>
              <DetailBody
                fillValue
                loadLargeMessage={loadLargeMessage}
                msg={msg}
                onOpenSectionsChange={handleOpenSectionsChange}
                sections={sections}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-card" data-testid="message-detail-panel">
      <div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
        <span className="min-w-0 flex-1 font-semibold text-label">Message</span>
        <Button
          aria-label="Expand"
          onClick={() => onExpandedChange(true)}
          size="icon-xs"
          testId="detail-expand"
          title="Expand"
          variant="ghost"
        >
          <Maximize2Icon />
        </Button>
        <Button aria-label="Close" onClick={onClose} size="icon-xs" testId="detail-close" title="Close" variant="ghost">
          <XIcon />
        </Button>
      </div>
      <DetailBody
        loadLargeMessage={loadLargeMessage}
        msg={msg}
        onOpenSectionsChange={handleOpenSectionsChange}
        sections={sections}
      />
    </div>
  );
};
