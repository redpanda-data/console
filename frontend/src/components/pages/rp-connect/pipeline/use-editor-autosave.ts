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

import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { autosaveTargetKey, rpcnEditorAutosave } from 'state/rpcn-editor-autosave';

import type { usePipelineEditorStoreApi } from './use-pipeline-editor-store';
import type { PipelineFormValues } from '.';

/**
 * How long the editor has to be idle before the buffer is written. Long enough that continuous typing
 * writes once rather than per keystroke, short enough that a crash costs a sentence, not a session.
 */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * Mirrors the editor into localStorage so a refresh, a crashed tab or a closed laptop doesn't take the
 * work with it.
 *
 * Deliberately dumb: it writes whatever is in the editor, valid or not, and never navigates, toasts or
 * blocks. The buffer is offered back on the next visit to the same editor (see
 * `AutosaveRestoreNotice`) and dropped as soon as a real save succeeds.
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
  // Whether this editor has written the buffer. A buffer left by an earlier session is somebody's
  // unsaved work, and must never be cleaned up as a side effect of merely opening the editor: loading
  // a pipeline settles the document back to "nothing to recover", which would otherwise delete the
  // recovery buffer about a second before the user could click Restore.
  const hasWrittenRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const write = () => {
      const { yamlContent, initialYaml } = editorStore.getState();
      // Only what is actually recoverable. Writing unconditionally would mean every visit to a
      // pipeline left a buffer that the next visit offered to "restore".
      //
      // A null baseline means nothing has loaded yet — true on the create page, which never resolves
      // one unless a template or the diagrams lane seeds it. There, anything non-empty in the document
      // is by definition something the user typed.
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
    };

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
      // A pending write is dropped rather than flushed on the way out, deliberately: leaving the
      // editor goes through the unsaved-changes dialog, and "Discard changes" has to mean discard —
      // flushing here would resurrect the discarded work as a recovery offer on the next visit.
      clearTimeout(timer);
      unsubscribeStore();
      unsubscribeForm();
    };
  }, [enabled, targetKey, editorStore]);
}
