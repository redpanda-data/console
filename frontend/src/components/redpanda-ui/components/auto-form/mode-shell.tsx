'use client';

import { clsx } from 'clsx';
import { MotionConfig } from 'motion/react';
import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { Button } from '../button';
import { CopyButton } from '../copy-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import { Textarea } from '../textarea';
import { formSpacing } from './form-spacing';
import { buildAutoFormTestId } from './test-ids';
import type { AutoFormMode, AutoFormSummaryContext } from './types';
import { safeStringify } from './utils/serialization';

function getModeLabel(mode: AutoFormMode): string {
  if (mode === 'json') {
    return 'JSON';
  }
  if (mode === 'simple') {
    return 'Simple';
  }
  return 'Advanced';
}

function JsonBlock({ description, jsonText, title }: { title: string; description: string; jsonText: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-xs">
      <div className="border-b px-5 py-4">
        <div className="space-y-1">
          <h3 className="text-heading-md">{title}</h3>
          <div className="text-body-sm text-subtle">{description}</div>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-body-sm font-medium tracking-wide text-subtle uppercase">Payload JSON</div>
          <CopyButton content={jsonText} size="sm" variant="outline">
            Copy JSON
          </CopyButton>
        </div>
        <div className="max-h-[min(60vh,38rem)] overflow-auto rounded-xl bg-surface-recess p-4">
          <pre className="overflow-auto font-mono text-body-sm leading-5 wrap-break-word whitespace-pre-wrap">
            {jsonText}
          </pre>
        </div>
      </div>
    </div>
  );
}

function JsonEditorPanel({
  bestEffort,
  editorError,
  jsonText,
  onFormat,
  onJsonTextChange,
  onReset,
  testIdPrefix,
}: {
  bestEffort: boolean;
  editorError?: string | undefined;
  jsonText: string;
  onFormat: () => void;
  onJsonTextChange: (value: string) => void;
  onReset: () => void;
  testIdPrefix: string;
}) {
  const editorErrorId = React.useId();
  const hasEditorError = editorError !== undefined && editorError !== '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-heading-md">Payload JSON</h3>
          <div className="text-body-sm text-subtle">
            Edit the payload directly, then switch back to the form whenever you want.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton content={jsonText} size="sm" variant="outline">
            Copy JSON
          </CopyButton>
          <Button onClick={onFormat} size="sm" type="button" variant="outline">
            Format JSON
          </Button>
          <Button onClick={onReset} size="sm" type="button" variant="outline">
            Reset
          </Button>
        </div>
      </div>
      {bestEffort ? (
        <Alert>
          <AlertTitle>Best-effort preview</AlertTitle>
          <AlertDescription>
            Some values are still invalid, so this payload may not be ready to submit just yet.
          </AlertDescription>
        </Alert>
      ) : null}
      {hasEditorError ? (
        <Alert id={editorErrorId} variant="destructive">
          <AlertTitle>Invalid JSON</AlertTitle>
          <AlertDescription>{editorError}</AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        aria-describedby={hasEditorError ? editorErrorId : undefined}
        aria-invalid={hasEditorError || undefined}
        aria-label="Payload JSON"
        className="min-h-[420px]"
        onChange={(event) => {
          onJsonTextChange(event.target.value);
        }}
        resize="vertical"
        testId={buildAutoFormTestId(testIdPrefix, 'json-editor')}
        textStyle="code"
        value={jsonText}
      />
    </div>
  );
}

function FormPanel<T extends Record<string, unknown>>({
  children,
  context,
  payload,
  renderSummary,
  testIdPrefix,
}: {
  children: React.ReactNode;
  context: AutoFormSummaryContext<T>;
  payload: unknown;
  renderSummary?: ((payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode) | undefined;
  testIdPrefix: string;
}) {
  const payloadText = safeStringify(payload);

  return (
    // A container, so the summary sits beside the form only when the form's own space allows it, not
    // whenever the viewport is past `lg`: in a panel or a docs preview it would squeeze the labels.
    <div className="@container/auto-form">
      <div className="grid gap-6 @4xl/auto-form:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] @4xl/auto-form:items-start @4xl/auto-form:gap-10">
        {/* formSpacing.form drives the column rhythm to match the <Form> primitive's internal spacing. */}
        <div className={clsx('min-w-0 @4xl/auto-form:pr-2', formSpacing.form)}>{children}</div>
        <aside
          className="min-w-0 @4xl/auto-form:sticky @4xl/auto-form:top-6 @4xl/auto-form:self-start"
          data-testid={buildAutoFormTestId(testIdPrefix, 'summary')}
        >
          {renderSummary === undefined ? (
            <JsonBlock
              description="Payload preview for the request AutoForm is preparing. On wider screens this stays pinned on the right, and it drops below the form when space gets tight."
              jsonText={payloadText}
              title="Summary"
            />
          ) : (
            renderSummary(payload, context)
          )}
        </aside>
      </div>
    </div>
  );
}

export function AutoFormModeShell<T extends Record<string, unknown>>({
  bestEffort,
  jsonEditorError,
  jsonText,
  mode,
  modes,
  onFormatJson,
  onJsonTextChange,
  onModeChange,
  onResetJson,
  payload,
  renderSummary,
  summaryContext,
  renderFormMode,
  showSummary,
  testIdPrefix,
}: {
  bestEffort: boolean;
  jsonEditorError?: string | undefined;
  jsonText: string;
  mode: AutoFormMode;
  modes: AutoFormMode[];
  onFormatJson: () => void;
  onJsonTextChange: (value: string) => void;
  onModeChange: (mode: AutoFormMode) => void;
  onResetJson: () => void;
  payload: unknown;
  renderSummary?: ((payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode) | undefined;
  summaryContext: AutoFormSummaryContext<T>;
  renderFormMode: (mode: Exclude<AutoFormMode, 'json'>) => React.ReactNode;
  showSummary: boolean;
  testIdPrefix: string;
}) {
  const renderModeBody = (targetMode: AutoFormMode) => {
    if (targetMode === 'json') {
      return (
        <JsonEditorPanel
          bestEffort={bestEffort}
          editorError={jsonEditorError}
          jsonText={jsonText}
          onFormat={onFormatJson}
          onJsonTextChange={onJsonTextChange}
          onReset={onResetJson}
          testIdPrefix={testIdPrefix}
        />
      );
    }

    const formContent = renderFormMode(targetMode);
    if (!showSummary) {
      return formContent;
    }

    return (
      <FormPanel
        context={{ ...summaryContext, mode: targetMode }}
        payload={payload}
        renderSummary={renderSummary}
        testIdPrefix={testIdPrefix}
      >
        {formContent}
      </FormPanel>
    );
  };

  if (modes.length <= 1) {
    return <>{renderModeBody(mode)}</>;
  }

  return (
    <MotionConfig reducedMotion="always">
      <Tabs
        onValueChange={(value: unknown) => {
          if (value !== 'simple' && value !== 'advanced' && value !== 'json') {
            throw new TypeError('Invalid AutoForm display mode');
          }
          onModeChange(value);
        }}
        testId={buildAutoFormTestId(testIdPrefix, 'tabs')}
        value={mode}
      >
        <TabsList className="w-full justify-start" variant="underline">
          {modes.map((tabMode) => (
            <TabsTrigger
              key={tabMode}
              testId={buildAutoFormTestId(testIdPrefix, `tab-${tabMode}`)}
              value={tabMode}
              variant="underline"
            >
              {getModeLabel(tabMode)}
            </TabsTrigger>
          ))}
        </TabsList>
        {modes.map((tabMode) => (
          <TabsContent key={tabMode} testId={buildAutoFormTestId(testIdPrefix, `panel-${tabMode}`)} value={tabMode}>
            {renderModeBody(tabMode)}
          </TabsContent>
        ))}
      </Tabs>
    </MotionConfig>
  );
}
