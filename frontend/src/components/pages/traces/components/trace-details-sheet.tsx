/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { InlineCode, Text } from 'components/redpanda-ui/components/typography';
import { AlertCircle, Link2, Maximize2, X } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useGetTraceQuery } from 'react-query/api/tracing';
import { toast } from 'sonner';

import { getDefaultTab, isLLMSpan, isToolSpan, TraceDetailsTabs } from './trace-details-tabs';
import { bytesToHex } from '../utils/hex-utils';
import { getSpanKind } from '../utils/span-classifier';
import { isIncompleteTrace, isRootSpan } from '../utils/trace-statistics';

type Props = {
  traceId: string | null;
  spanId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

export const TraceDetailsSheet: FC<Props> = ({ traceId, spanId, isOpen, onClose }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useQueryState('tab', parseAsString.withDefault('overview'));
  const { data: traceData, isLoading } = useGetTraceQuery(traceId);

  const trace = traceData?.trace;

  const handleCopyLink = async () => {
    if (!(traceId && spanId)) {
      return;
    }

    // Check if clipboard API is available
    if (!navigator.clipboard?.writeText) {
      toast.error('Clipboard API not available');
      return;
    }

    // Use URL constructor for robust URL building
    const url = new URL(window.location.href);
    url.searchParams.set('traceId', traceId);
    url.searchParams.set('spanId', spanId);

    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link to clipboard');
    }
  };

  const spanById = useMemo(() => {
    const map = new Map<string, Span>();
    for (const span of trace?.spans ?? []) {
      map.set(bytesToHex(span.spanId), span);
    }
    return map;
  }, [trace?.spans]);

  const selectedSpan = spanId ? spanById.get(spanId) : undefined;
  const isIncomplete = isIncompleteTrace(trace?.summary?.rootSpanName);

  // Compute which tabs are available for the selected span
  const { showToolTab, showLLMTab, showOverviewTab } = useMemo(() => {
    if (!selectedSpan) {
      return { showToolTab: false, showLLMTab: false, showOverviewTab: false };
    }
    return {
      showToolTab: isToolSpan(selectedSpan),
      showLLMTab: isLLMSpan(selectedSpan),
      showOverviewTab: isRootSpan(selectedSpan),
    };
  }, [selectedSpan]);

  // Reset to default tab when span changes
  useEffect(() => {
    if (selectedSpan) {
      const defaultTab = getDefaultTab(showOverviewTab, showLLMTab, showToolTab);
      setSelectedTab(defaultTab);
    }
  }, [showOverviewTab, showLLMTab, showToolTab, selectedSpan, setSelectedTab]);

  if (!isOpen) {
    return null;
  }

  const spanKind = selectedSpan ? getSpanKind(selectedSpan) : 'span';

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header - Compact v0 style */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-3">
        <div className="flex items-center gap-2">
          {!!isIncomplete && (
            <>
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground text-sm">Incomplete Trace</span>
            </>
          )}
          {!isIncomplete && (
            <Badge
              className="h-4 border-border bg-muted/50 px-1 py-0 text-[10px] text-muted-foreground"
              variant="outline"
            >
              {spanKind}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Copy link to span"
                className="h-6 w-6"
                data-testid="trace-details-copy-link"
                onClick={handleCopyLink}
                size="icon"
                variant="ghost"
              >
                <Link2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy link to span</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Expand to full view"
                className="h-6 w-6"
                data-testid="trace-details-expand"
                onClick={() => setIsDialogOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Expand to full view</TooltipContent>
          </Tooltip>
          <Button
            aria-label="Close details panel"
            className="h-6 w-6"
            data-testid="trace-details-close"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {!!isLoading && (
          <div className="space-y-4 p-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {!(isLoading || selectedSpan) && isIncomplete && (
          <div className="space-y-4 p-4">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <Text as="p" className="font-medium text-amber-600" variant="small">
                    Waiting for root span
                  </Text>
                  <Text as="p" className="mt-1" variant="muted">
                    The parent span for this trace hasn't been received yet. Child spans are displayed in the trace
                    list. The root span will appear once the operation completes.
                  </Text>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Text as="div" className="uppercase tracking-wide" variant="label">
                Trace Info
              </Text>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <Text variant="muted">Trace ID</Text>
                  <InlineCode>{trace?.traceId?.slice(0, 8)}...</InlineCode>
                </div>
                <div className="flex justify-between">
                  <Text variant="muted">Received Spans</Text>
                  <Text variant="small">{trace?.summary?.spanCount || 0}</Text>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && selectedSpan && (
          <TraceDetailsTabs onValueChange={setSelectedTab} span={selectedSpan} trace={trace} value={selectedTab} />
        )}

        {!(isLoading || selectedSpan || isIncomplete) && (
          <div className="p-8 text-center text-muted-foreground">Span not found</div>
        )}
      </div>

      {/* Expanded Dialog */}
      <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{selectedSpan?.name || 'Span Details'}</DialogTitle>
            <DialogDescription>Span ID: {spanId}</DialogDescription>
          </DialogHeader>
          <div className="h-[70vh] overflow-auto">
            {!!selectedSpan && (
              <TraceDetailsTabs onValueChange={setSelectedTab} span={selectedSpan} trace={trace} value={selectedTab} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
