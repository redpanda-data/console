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

/** Long enough that continuous typing writes once; short enough that a crash costs a sentence. */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Mirrors the editor into localStorage so a refresh or a crashed tab doesn't take the work with it.
 * Deliberately dumb: writes whatever is there, valid or not, and never navigates, toasts or blocks.
 */
export function useEditorAutosave({
  enabled,
  pipelineId,
  form,
  editorStore,
}: {
  /** Off in view mode, which has nothing to lose. */
  enabled: boolean;
  /** Undefined on the create page, which has its own buffer. */
  pipelineId: string | undefined;
  form: UseFormReturn<PipelineFormValues>;
  editorStore: ReturnType<typeof usePipelineEditorStoreApi>;
}) {
  const targetKey = autosaveTargetKey(pipelineId);
  // Latest form handle for the long-lived subscription, without re-subscribing per render.
  const formRef = useRef(form);
  formRef.current = form;
  // A buffer left by an earlier session must never be cleaned up just because the editor opened:
  // loading a pipeline settles the document back to "nothing to recover", which would delete it a
  // second before the user could click Restore.
  const hasWrittenRef = useRef(false);

  const write = useCallback(() => {
    const { yamlContent, initialYaml } = editorStore.getState();
    // Only what is actually recoverable, or every visit would leave a buffer the next visit offered
    // to restore. A null baseline means nothing loaded yet (the create page), where anything
    // non-empty is by definition something the user typed.
    const documentChanged = initialYaml === null ? yamlContent.trim() !== '' : yamlContent !== initialYaml;
    if (!(documentChanged || formRef.current.formState.isDirty)) {
      // Only tidying up after this editor — an undo back to the loaded state, say.
      if (hasWrittenRef.current) {
        rpcnEditorAutosave.clear(targetKey);
        hasWrittenRef.current = false;
      }
      return;
    }
    const values = formRef.current.getValues();
    hasWrittenRef.current = true;
    rpcnEditorAutosave.save({
      targetKey,
      name: values.name,
      description: values.description ?? '',
      computeUnits: values.computeUnits,
      tags: values.tags,
      configYaml: yamlContent,
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

    // Both halves of the document: the YAML lives in the editor store, the settings in the form.
    const unsubscribeStore = editorStore.subscribe((state, prev) => {
      if (state.yamlContent !== prev.yamlContent) {
        schedule();
      }
    });
    const unsubscribeForm = formRef.current.subscribe({ formState: { values: true }, callback: schedule });

    return () => {
      // Dropped rather than flushed, deliberately: "Discard changes" has to mean discard, and a flush
      // here would resurrect it as a recovery offer next visit.
      clearTimeout(timer);
      unsubscribeStore();
      unsubscribeForm();
    };
  }, [enabled, editorStore, write]);

  /**
   * Write now instead of on the debounce. For "Leave for now", which promises the edits are kept: the
   * pending write is dropped on unmount, so without this the promise loses up to a second of typing —
   * and a second of typing is exactly what someone leaving in a hurry has just done.
   */
  return { flush: write };
}
