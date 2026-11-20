import type { DescMessage } from '@bufbuild/protobuf';
import { useEffect, useRef, useState } from 'react';
import { protoPayloadToFormValues } from '../../lib/protobuf-provider/form-values';
import type { AutoFormPayloadBuilderContext, AutoFormProps } from './types';
import { isRecord } from './ui-config';

interface PayloadEditorOptions<T extends Record<string, unknown>> {
  context: AutoFormPayloadBuilderContext<T>;
  parser: AutoFormProps<T>['payloadParser'];
  payloadText: string;
  protoDesc: DescMessage | undefined;
}

async function parseFormValues<T extends Record<string, unknown>>(
  incoming: unknown,
  { context, parser, protoDesc }: PayloadEditorOptions<T>
): Promise<Record<string, unknown> | undefined> {
  if (parser !== undefined) {
    return await parser(incoming, context);
  }
  if (protoDesc !== undefined) {
    return protoPayloadToFormValues(protoDesc, incoming);
  }
  return isRecord(incoming) ? incoming : undefined;
}

/** Own JSON draft state and cancel obsolete applications, including malformed edits and resets. */
export function usePayloadEditor<T extends Record<string, unknown>>(options: PayloadEditorOptions<T>) {
  const { context, payloadText } = options;
  const [jsonEditorText, setJsonEditorText] = useState(payloadText);
  const [jsonEditorError, setJsonEditorError] = useState<string>();
  const [applying, setApplying] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const [syncedPayload, setSyncedPayload] = useState(payloadText);
  if (!applying && jsonEditorError === undefined && syncedPayload !== payloadText) {
    setSyncedPayload(payloadText);
    setJsonEditorText(payloadText);
  }

  useEffect(function cancelOnUnmount() {
    return () => {
      requestRef.current?.abort();
    };
  }, []);

  async function applyJson(value: string) {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setApplying(true);
    setJsonEditorText(value);
    try {
      const incoming: unknown = JSON.parse(value);
      setJsonEditorError(undefined);
      const nextValues = await parseFormValues(incoming, options);
      if (request.signal.aborted) {
        return;
      }
      if (nextValues === undefined) {
        setJsonEditorError('AutoForm could not map this JSON payload back into the form.');
        setApplying(false);
        return;
      }
      context.form.reset(nextValues, { keepDefaultValues: true });
      setJsonEditorError(undefined);
    } catch (error) {
      if (!request.signal.aborted) {
        setJsonEditorError(error instanceof Error ? error.message : 'AutoForm could not apply this payload.');
      }
    }
    if (!request.signal.aborted) {
      setApplying(false);
    }
  }

  function handleJsonTextChange(value: string) {
    applyJson(value).catch((error: unknown) => {
      setJsonEditorError(error instanceof Error ? error.message : 'Could not apply JSON.');
    });
  }

  function handleResetJson() {
    requestRef.current?.abort();
    setApplying(false);
    setJsonEditorError(undefined);
    setJsonEditorText(payloadText);
  }

  function handleFormatJson() {
    try {
      const parsed: unknown = JSON.parse(jsonEditorText);
      handleJsonTextChange(JSON.stringify(parsed, null, 2));
    } catch (error) {
      requestRef.current?.abort();
      setApplying(false);
      setJsonEditorError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  }

  return { jsonEditorText, jsonEditorError, handleJsonTextChange, handleResetJson, handleFormatJson };
}
