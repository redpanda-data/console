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

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { type PipelineLogCounts, usePipelineLogCounts } from './use-pipeline-log-counts';

type PipelineLogCountsContextValue = {
  /** Get log counts for a specific pipeline */
  getCounts: (pipelineId: string) => PipelineLogCounts | undefined;
  /** Whether counts are currently loading */
  isLoading: boolean;
};

const PipelineLogCountsContext = createContext<PipelineLogCountsContextValue | null>(null);

type PipelineLogCountsProviderProps = {
  /** Pipeline IDs to fetch log counts for (should be visible IDs only) */
  pipelineIds: string[];
  children: ReactNode;
};

/**
 * Provider that fetches pipeline log counts for the given pipeline IDs.
 * Use this to wrap table components so cells can access counts via context.
 *
 * @example
 * ```tsx
 * <PipelineLogCountsProvider pipelineIds={visiblePipelineIds}>
 *   <Table>...</Table>
 * </PipelineLogCountsProvider>
 * ```
 */
export const PipelineLogCountsProvider = ({ pipelineIds, children }: PipelineLogCountsProviderProps) => {
  const { data: logCounts, isLoading } = usePipelineLogCounts(pipelineIds);

  const value = useMemo<PipelineLogCountsContextValue>(
    () => ({
      getCounts: (pipelineId: string) => logCounts?.get(pipelineId),
      isLoading,
    }),
    [logCounts, isLoading]
  );

  return <PipelineLogCountsContext.Provider value={value}>{children}</PipelineLogCountsContext.Provider>;
};

/**
 * Hook to access pipeline log counts from context.
 * Must be used within a PipelineLogCountsProvider.
 */
export const usePipelineLogCountsContext = (): PipelineLogCountsContextValue => {
  const context = useContext(PipelineLogCountsContext);
  if (!context) {
    throw new Error('usePipelineLogCountsContext must be used within a PipelineLogCountsProvider');
  }
  return context;
};
