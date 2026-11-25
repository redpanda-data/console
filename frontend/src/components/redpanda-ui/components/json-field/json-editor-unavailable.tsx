'use client';

// Copyright 2026 Redpanda Data, Inc.

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../button';
import { Textarea } from '../textarea';
import type { JSONCodeEditorProps } from './json-code-editor';

interface JSONEditorUnavailableProps extends JSONCodeEditorProps {
  reason: string;
}

export function JSONEditorUnavailable({
  ariaLabel,
  describedBy,
  id,
  invalid,
  onValueChange,
  placeholder,
  value,
  reason,
}: JSONEditorUnavailableProps) {
  const [plainText, setPlainText] = useState(false);
  const statusId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(
    function focusPlainTextRecovery() {
      if (plainText) {
        inputRef.current?.focus({ preventScroll: true });
      }
    },
    [plainText]
  );
  if (!plainText) {
    return (
      <div className="space-y-3 p-3" role="alert">
        <p>Could not load the JSON editor.</p>
        <p>{reason}</p>
        <Button
          onClick={() => {
            setPlainText(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Use plain-text editor
        </Button>
      </div>
    );
  }
  return (
    <div>
      <p className="px-3 pt-3 text-body-sm text-subtle" id={statusId} role="status">
        Syntax highlighting is unavailable. You can still edit JSON.
      </p>
      <Textarea
        appearance="embedded"
        aria-describedby={[describedBy, statusId].filter((entry) => entry !== undefined && entry !== '').join(' ')}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        id={id}
        onChange={(event) => {
          onValueChange(event.currentTarget.value);
        }}
        placeholder={placeholder}
        ref={inputRef}
        resize="vertical"
        rows={8}
        size="lg"
        textStyle="code"
        value={value}
      />
    </div>
  );
}
