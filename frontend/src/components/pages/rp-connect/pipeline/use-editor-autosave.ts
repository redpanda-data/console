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

import { useCallback, useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { autosaveTargetKey, rpcnEditorAutosave } from 'state/rpcn-editor-autosave';

import type { usePipelineEditorStoreApi } from './use-pipeline-editor-store';
import type { PipelineFormValues } from '.';

export const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Mirrors the editor (YAML + settings) into localStorage on a debounce. Never navigates, toasts or blocks;
 * `flush` reports whether the buffer is in storage, for the one caller that promises it is.
 */
export function useEditorAutosave({
  enabled,
  pipelineId,
  form,
  editorStore,
}: {
  enabled: boolean;
  /** Undefined on the create page. */
  pipelineId: string | undefined;
  form: UseFormReturn<PipelineFormValues>;
  editorStore: ReturnType<typeof usePipelineEditorStoreApi>;
}) {
  const targetKey = autosaveTargetKey(pipelineId);
  const formRef = useRef(form);
  formRef.current = form;
  // Only clear a buffer this editor wrote; an earlier session's must survive the load settling.
  const hasWrittenRef = useRef(false);

  const write = useCallback((): boolean => {
    // `baselineUpdateTime` is the version on screen, not the live query: a refetch must not move it.
    const { yamlContent, initialYaml, baselineUpdateTime } = editorStore.getState();
    const documentChanged = initialYaml === null ? yamlContent.trim() !== '' : yamlContent !== initialYaml;
    if (!(documentChanged || formRef.current.formState.isDirty)) {
      if (hasWrittenRef.current) {
        rpcnEditorAutosave.clear(targetKey);
        hasWrittenRef.current = false;
      }
      return true;
    }
    const values = formRef.current.getValues();
    hasWrittenRef.current = true;
    return rpcnEditorAutosave.save({
      targetKey,
      name: values.name,
      description: values.description ?? '',
      computeUnits: values.computeUnits,
      tags: values.tags,
      configYaml: yamlContent,
      basedOnUpdateTime: baselineUpdateTime,
    });
  }, [targetKey, editorStore]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(write, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubscribeStore = editorStore.subscribe((state, prev) => {
      if (state.yamlContent !== prev.yamlContent) {
        schedule();
      }
    });
    const unsubscribeForm = formRef.current.subscribe({ formState: { values: true }, callback: schedule });

    return () => {
      // Dropped, not flushed: "Discard changes" must not leave a buffer behind.
      clearTimeout(timer);
      unsubscribeStore();
      unsubscribeForm();
    };
  }, [enabled, editorStore, write]);

  return { flush: write };
}
