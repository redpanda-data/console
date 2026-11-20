'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Braces, FileEdit, SpellCheck } from 'lucide-react';
import type React from 'react';
import { useEffect, useEffectEvent, useId, useState } from 'react';
import { Button } from '../button';
import { CopyButton } from '../copy-button';
import { toast } from '../toast/manager';
import type { SharedProps } from '../../lib/utils';
import { JSONEditor } from './json-editor';
import { generateExampleData, normalizeJSONFieldValue, serializeJSONValue } from './json-field-values';
import { useJSONOptions } from './json-form-controls';
import { JSONFormField } from './json-form-fields';
import { useJSONDocumentIdentity } from './json-form-identity';
import { type CustomFieldConfig, type JSONSchemaType, type JSONValue, parseJSONValue } from './json-value';

const DEFAULT_CUSTOM_FIELDS: CustomFieldConfig[] = [];

type JSONFieldProps = {
  schema: JSONSchemaType;
  /** Emitted-document echoes retain row-local UI. Unmatched replacements reset it; use a React key to force reset. */
  value: JSONValue;
  onChange: (value: JSONValue) => void;
  onBlur?: (() => void) | undefined;
  maxDepth?: number | undefined;
  showPlaceholder?: boolean | undefined;
  customFields?: CustomFieldConfig[] | undefined;
  className?: string | undefined;
} & Omit<React.ComponentProps<'div'>, 'onChange'> &
  SharedProps;

const JSONField = ({
  schema,
  value,
  onChange,
  onBlur,
  maxDepth = 3,
  showPlaceholder = true,
  customFields = DEFAULT_CUSTOM_FIELDS,
  className,
  testId,
  ref,
  ...rest
}: JSONFieldProps) => {
  const fieldId = useId();
  const options = useJSONOptions();
  const shouldUseJSONMode =
    schema.type === 'object' && (schema.properties === undefined || Object.keys(schema.properties).length === 0);
  const [requestedJSONMode, setRequestedJSONMode] = useState(false);
  const isJSONMode = shouldUseJSONMode || requestedJSONMode;
  const [jsonError, setJSONError] = useState<string>();
  const documentIdentity = useJSONDocumentIdentity(value, onChange, setJSONError);

  // Raw JSON string for immediate typing feedback; parsing is deferred (debounced) until the user pauses.
  const rawJSONSource = serializeJSONValue(value);
  const [rawJSONDraft, setRawJSONDraft] = useState(() => ({
    source: rawJSONSource,
    value: rawJSONSource,
    pending: false,
  }));
  const rawJSONValue = rawJSONDraft.source === rawJSONSource ? rawJSONDraft.value : rawJSONSource;
  const setRawJSONValue = (nextValue: string, pending = false) => {
    setRawJSONDraft({ source: rawJSONSource, value: nextValue, pending });
  };

  const commitJSONDraft = useEffectEvent((jsonString: string) => {
    try {
      onChange(parseJSONValue(jsonString));
      setJSONError(undefined);
    } catch (error) {
      setJSONError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  });

  useEffect(
    function debounceJSONDraft() {
      if (!rawJSONDraft.pending || rawJSONDraft.source !== rawJSONSource || !isJSONMode) {
        return;
      }
      const timeout = setTimeout(() => {
        commitJSONDraft(rawJSONDraft.value);
      }, 300);
      return () => {
        clearTimeout(timeout);
      };
    },
    [rawJSONDraft, rawJSONSource, isJSONMode]
  );

  const handleSwitchToFormMode = () => {
    if (isJSONMode) {
      if (rawJSONValue.trim() === '' && value === undefined) {
        setRequestedJSONMode(false);
        setJSONError(undefined);
        return;
      }
      // Switching to Form mode requires valid JSON
      try {
        const parsed = parseJSONValue(rawJSONValue);
        onChange(parsed);
        setJSONError(undefined);
        setRequestedJSONMode(false);
      } catch (error) {
        setJSONError(error instanceof Error ? error.message : 'Invalid JSON');
      }
    } else {
      setRawJSONValue(rawJSONSource);
      setRequestedJSONMode(true);
    }
  };

  const formatJSON = () => {
    try {
      const jsonStr = rawJSONValue.trim();
      if (jsonStr === '') {
        return;
      }
      const formatted = JSON.stringify(parseJSONValue(jsonStr), null, 2);
      setRawJSONValue(formatted, true);
      setJSONError(undefined);
    } catch (error) {
      setJSONError(error instanceof Error ? error.message : 'Invalid JSON');
    }
  };

  const normalizedFormValue = isJSONMode ? value : normalizeJSONFieldValue(schema, value, customFields);
  const commitFormDefaults = useEffectEvent((normalizedValue: JSONValue) => {
    documentIdentity.proposeFieldChange([], normalizedValue);
  });

  useEffect(
    function syncFormDefaults() {
      if (normalizedFormValue === value) {
        return;
      }
      const timeout = window.setTimeout(() => {
        commitFormDefaults(normalizedFormValue);
      }, 0);
      return () => {
        window.clearTimeout(timeout);
      };
    },
    [normalizedFormValue, value]
  );

  return (
    <div className={className} data-testid={testId} ref={ref} {...rest}>
      <fieldset aria-label={schema.title} className="min-w-0 space-y-4" onBlur={() => onBlur?.()}>
        <div className="flex flex-wrap justify-end gap-2">
          {isJSONMode ? (
            <>
              <CopyButton
                content={JSON.stringify(value, null, 2)}
                onCopy={() => {
                  toast.add({
                    title: 'JSON copied',
                    type: 'success',
                    description: 'The JSON data has been successfully copied to your clipboard.',
                  });
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Copy JSON
              </CopyButton>
              <Button onClick={formatJSON} size="sm" type="button" variant="outline">
                <SpellCheck className="size-4" />
                Format JSON
              </Button>
            </>
          ) : null}

          <Button onClick={handleSwitchToFormMode} size="sm" type="button" variant="outline">
            {isJSONMode ? (
              <>
                <FileEdit className="size-4" />
                Switch to Form
              </>
            ) : (
              <>
                <Braces className="size-4" />
                Switch to JSON
              </>
            )}
          </Button>
        </div>

        {!isJSONMode && jsonError !== undefined && jsonError !== '' ? (
          <p className="text-body-sm text-destructive" role="alert">
            {jsonError}
          </p>
        ) : null}
        {isJSONMode ? (
          <JSONEditor
            error={jsonError}
            onChange={(newValue) => {
              setRawJSONValue(newValue, true);
            }}
            placeholder={showPlaceholder ? JSON.stringify(generateExampleData(schema), null, 2) : undefined}
            value={rawJSONValue}
          />
        ) : (
          <JSONFormField
            depth={0}
            key={documentIdentity.epoch}
            optionKey="schema"
            path={[]}
            schema={schema}
            settings={{
              customFields,
              document: value,
              fieldId,
              options,
              error: jsonError,
              maxDepth,
              onError: setJSONError,
              onFieldChange: documentIdentity.proposeFieldChange,
            }}
            value={value}
          />
        )}
      </fieldset>
    </div>
  );
};

export type { CustomFieldConfig, JSONObject, JSONSchemaConst, JSONSchemaType, JSONValue } from './json-value';
export { JSONField };
