'use client';

import { lazy, type NamedExoticComponent, Suspense, useId } from 'react';
import { cn } from '../../lib/utils';
import { editorLoadErrorMessage } from './editor-load-error';
import type { JSONCodeEditorProps } from './json-code-editor';
import { JSONEditorUnavailable } from './json-editor-unavailable';

const JSONCodeEditor: NamedExoticComponent<JSONCodeEditorProps> = lazy(() =>
  import(/* webpackChunkName: "json-code-editor" */ './json-code-editor').then(
    (module) => ({ default: module.JSONCodeEditor }),
    (error: unknown) => {
      const reason = editorLoadErrorMessage(error);
      return {
        default: function FailedEditor(props: JSONCodeEditorProps) {
          return <JSONEditorUnavailable {...props} reason={reason} />;
        },
      };
    }
  )
);

JSONCodeEditor.displayName = 'JSONCodeEditor';

interface JSONEditorProps {
  error?: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  value: string;
}

export const JSONEditor = ({ value, onChange, error: externalError, placeholder }: JSONEditorProps) => {
  const editorId = useId();
  const errorId = useId();

  return (
    <div className="relative">
      <div
        className={cn(
          'overflow-hidden rounded-md border border-input shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 motion-reduce:transition-none',
          // `invalid` is the declared halo, and it has to carry `focus-within:` to reach the
          // ring: unprefixed it loses to the base's own `focus-within:` colour and never paints.
          // Every other field marks invalid the same way — a red border, and a red focus ring.
          externalError !== undefined && externalError !== ''
            ? 'border-destructive focus-within:ring-invalid'
            : externalError
        )}
      >
        <Suspense
          fallback={
            <div
              aria-label="Loading JSON editor"
              className="flex min-h-25 items-center px-3 text-body-sm text-subtle"
              role="status"
            >
              Loading JSON editor…
            </div>
          }
        >
          <JSONCodeEditor
            ariaLabel="JSON code"
            describedBy={externalError !== undefined && externalError !== '' ? errorId : undefined}
            id={editorId}
            invalid={Boolean(externalError)}
            onValueChange={onChange}
            placeholder={placeholder}
            value={value}
          />
        </Suspense>
      </div>
      {externalError !== undefined && externalError !== '' ? (
        <div className="mt-1 text-body-sm text-destructive" id={errorId}>
          {externalError}
        </div>
      ) : null}
    </div>
  );
};
