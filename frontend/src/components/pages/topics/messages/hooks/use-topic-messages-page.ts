import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelSize } from 'react-resizable-panels';

import { useMessageSearch } from './use-message-search';
import { useMessagesQuery, useSearchRunner } from './use-messages-query';
import { useMessagesTableState } from './use-messages-table-state';
import { useMessagesUrlState } from './use-messages-url-state';
import type { Topic, TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterEntry } from '../../../../../state/ui';
import { useTopicSettingsStore } from '../../../../../stores/topic-settings-store';
import { getTopicFilters, setTopicFilters } from '../../../../../utils/topic-filters-session';
import { patchDetailViewState, readDetailViewState } from '../detail/detail-view-state';
import type { ValuePreviewConfig } from '../table/message-cells';
import { valuePaths } from '../utils/client-match';

/** Which page-level overlays are open; any of them suspends the table's keyboard shortcuts. */
function usePageSurfaces() {
  const [docSheetOpen, setDocSheetOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [readScopeOpen, setReadScopeOpen] = useState(false);
  return {
    docSheetOpen,
    setDocSheetOpen,
    saveDialogOpen,
    setSaveDialogOpen,
    viewSettingsOpen,
    setViewSettingsOpen,
    readScopeOpen,
    setReadScopeOpen,
  };
}

/**
 * How the message detail is presented: docked or expanded, the docked panel's width, the focus
 * targets the panel hands focus back to, and closing it (which clears the URL selection).
 */
export function useDetailPresentation(setSelectedKey: (key: string | null) => void) {
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const fallbackFocusRef = useRef<HTMLDivElement>(null);

  // Detail presentation is a persisted preference: whoever prefers the expanded
  // sheet gets it again for the next message and after reloads.
  const [detailExpanded, setDetailExpandedState] = useState<boolean>(() => readDetailViewState().expanded);
  const setDetailExpanded = useCallback((expanded: boolean) => {
    setDetailExpandedState(expanded);
    patchDetailViewState({ expanded });
  }, []);

  const handleDetailClose = useCallback(() => {
    setSelectedKey(null);
  }, [setSelectedKey]);

  // Docked panel width is a persisted preference too. A ref (not state) so
  // resize drags don't re-render the whole page; the panel reads it on mount.
  const detailPanelSizeRef = useRef(readDetailViewState().panelSizePct);
  const handleDetailPanelResize = useCallback((size: PanelSize) => {
    detailPanelSizeRef.current = size.asPercentage;
    patchDetailViewState({ panelSizePct: size.asPercentage });
  }, []);

  return {
    expandButtonRef,
    fallbackFocusRef,
    detailExpanded,
    setDetailExpanded,
    handleDetailClose,
    detailPanelSizeRef,
    handleDetailPanelResize,
  };
}

export type JsFilterDialogState = { filter: FilterEntry | null; seedCode?: string; seedName?: string } | null;

/**
 * JavaScript push-down filters, persisted in sessionStorage per topic, plus the editor dialog's
 * state. JS filters are deliberately kept out of the URL.
 */
export function useJsFilters(topicName: string) {
  const [jsFilters, setJsFilters] = useState<FilterEntry[]>(() => getTopicFilters(topicName));
  const [jsDialog, setJsDialog] = useState<JsFilterDialogState>(null);

  useEffect(
    function persistJsFilters() {
      setTopicFilters(topicName, jsFilters);
    },
    [topicName, jsFilters]
  );

  return { jsFilters, setJsFilters, jsDialog, setJsDialog };
}

/** The table's look from the per-topic view settings, plus the value paths the settings panel suggests. */
function useViewSettingsState(topicName: string, messages: TopicMessage[]) {
  const { getRowDensity, getMessageColumns, getTopicSettings } = useTopicSettingsStore();
  const topicSettings = getTopicSettings(topicName);

  const valuePreview: ValuePreviewConfig = useMemo(
    () => ({
      tags: topicSettings?.previewTags ?? [],
      caseSensitive: topicSettings?.previewTagsCaseSensitive === 'caseSensitive',
      multiResultMode: topicSettings?.previewMultiResultMode ?? 'showAll',
      displayMode: topicSettings?.previewDisplayMode ?? 'single',
    }),
    [
      topicSettings?.previewTags,
      topicSettings?.previewTagsCaseSensitive,
      topicSettings?.previewMultiResultMode,
      topicSettings?.previewDisplayMode,
    ]
  );

  const valuePathHints = useMemo(() => valuePaths(messages), [messages]);

  return {
    density: getRowDensity(topicName),
    columnConfig: getMessageColumns(topicName),
    timestampFormat: topicSettings?.previewTimestamps ?? 'default',
    valuePreview,
    valuePathHints,
  };
}

/**
 * Everything the topic messages page renders from: URL state and the message stream, plus the
 * table, detail, filter and overlay state wired around them.
 */
export function useTopicMessagesPage(topic: Topic) {
  const urlState = useMessagesUrlState(topic.topicName);
  const search = useMessageSearch(topic.topicName);
  const surfaces = usePageSurfaces();
  const detail = useDetailPresentation(urlState.setSelectedKey);
  const jsFilters = useJsFilters(topic.topicName);
  const query = useMessagesQuery(topic.topicName, urlState, jsFilters.jsFilters);
  const runner = useSearchRunner({
    search,
    searchParams: query.searchParams,
    filterInterpreterCode: query.filterInterpreterCode,
    liveTail: urlState.liveTail,
    partitionId: urlState.partitionId,
  });
  const table = useMessagesTableState({
    search,
    urlState,
    partitionCount: topic.partitionCount,
    continuousActive: query.continuousActive,
    setViewSettingsOpen: surfaces.setViewSettingsOpen,
    keyboardNavEnabled: !(
      surfaces.saveDialogOpen ||
      jsFilters.jsDialog ||
      surfaces.viewSettingsOpen ||
      surfaces.docSheetOpen ||
      surfaces.readScopeOpen
    ),
  });
  const viewSettings = useViewSettingsState(topic.topicName, search.messages);

  return {
    urlState,
    search,
    surfaces,
    detail,
    jsFilters,
    query,
    runner,
    table,
    viewSettings,
    isSearching: search.phase === 'connecting' || search.phase === 'searching',
  };
}
