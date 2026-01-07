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
import { AlertCircle, Check, Link2, Maximize2, X } from 'lucide-react';
import type { Span } from 'protogen/redpanda/otel/v1/trace_pb';
import type { FC } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGetTraceQuery } from 'react-query/api/tracing';

import { getDefaultTab, isLLMSpan, isToolSpan, TraceDetailsTabs } from './trace-details-tabs';
import { bytesToHex } from '../utils/hex-utils';
import { getSpanKind } from '../utils/span-classifier';
import { isIncompleteTrace, isRootSpan } from '../utils/trace-statistics';

interface Props {
  traceId: string | null;
  spanId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TraceDetailsSheet: FC<Props> = ({ traceId, spanId, isOpen, onClose }) => {
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>('overview');
  const { data: traceData, isLoading } = useGetTraceQuery(traceId);
  const copyTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const trace = traceData?.trace;

  // Cleanup timeout on unmount
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    },
    []
  );

  const handleCopyLink = async () => {
    if (!(traceId && spanId)) {
      return;
    }

    // Check if clipboard API is available
    if (!navigator.clipboard?.writeText) {
      return;
    }

    // Use URL constructor for robust URL building
    const url = new URL(window.location.href);
    url.searchParams.set('traceId', traceId);
    url.searchParams.set('spanId', spanId);

    try {
      await navigator.clipboard.writeText(url.toString());
      setIsLinkCopied(true);
      copyTimeoutRef.current = setTimeout(() => setIsLinkCopied(false), 2000);
    } catch {
      setIsLinkCopied(false);
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
  }, [showOverviewTab, showLLMTab, showToolTab, selectedSpan]);

  if (!isOpen) {
    return null;
  }

  const spanKind = selectedSpan ? getSpanKind(selectedSpan.name) : 'span';

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header - Compact v0 style */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-3">
        <div className="flex items-center gap-2">
          {isIncomplete && (
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
              <Button className="h-6 w-6" onClick={handleCopyLink} size="icon" variant="ghost">
                {isLinkCopied ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy link to span</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="h-6 w-6" onClick={() => setIsDialogOpen(true)} size="icon" variant="ghost">
                <Maximize2 className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Expand to full view</TooltipContent>
          </Tooltip>
          <Button className="h-6 w-6" onClick={onClose} size="icon" variant="ghost">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading && (
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
                <div className="text-sm">
                  <p className="font-medium text-amber-600">Waiting for root span</p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    The parent span for this trace hasn't been received yet. Child spans are displayed in the trace
                    list. The root span will appear once the operation completes.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Trace Info</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trace ID</span>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{trace?.traceId?.slice(0, 8)}...</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Received Spans</span>
                  <span>{trace?.summary?.spanCount || 0}</span>
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
            {selectedSpan && (
              <TraceDetailsTabs onValueChange={setSelectedTab} span={selectedSpan} trace={trace} value={selectedTab} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
