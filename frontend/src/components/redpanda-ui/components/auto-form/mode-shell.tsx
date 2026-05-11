'use client';

import { MotionConfig } from 'motion/react';
import React from 'react';

import { formSpacing } from './form-spacing';
import { buildAutoFormTestId } from './test-ids';
import type { AutoFormMode, AutoFormSummaryContext } from './types';
import { safeStringify } from './utils/serialization';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { Button } from '../button';
import { CopyButton } from '../copy-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import { Textarea } from '../textarea';
import { Heading, Text } from '../typography';

function JsonBlock({ description, jsonText, title }: { title: string; description: string; jsonText: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-xs">
      <div className="border-b px-5 py-4">
        <div className="space-y-1">
          <Heading level={3}>{title}</Heading>
          <Text className="text-muted-foreground" variant="small">
            {description}
          </Text>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <Text className="font-medium text-muted-foreground uppercase tracking-[0.12em]" variant="small">
            Payload JSON
          </Text>
          <CopyButton content={jsonText} size="sm" variant="outline">
            Copy JSON
          </CopyButton>
        </div>
        <div className="max-h-[min(60vh,38rem)] overflow-auto rounded-xl bg-muted/35 p-4">
          <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">{jsonText}</pre>
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
  editorError?: string;
  jsonText: string;
  onFormat: () => void;
  onJsonTextChange: (value: string) => void;
  onReset: () => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading level={3}>Payload JSON</Heading>
          <Text className="text-muted-foreground" variant="small">
            Edit the payload directly, then switch back to the form whenever you want.
          </Text>
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
      {editorError ? (
        <Alert variant="destructive">
          <AlertTitle>Invalid JSON</AlertTitle>
          <AlertDescription>{editorError}</AlertDescription>
        </Alert>
      ) : null}
      <Textarea
        className="min-h-[420px] font-mono text-xs leading-5"
        onChange={(event) => onJsonTextChange(event.target.value)}
        resize="vertical"
        testId={buildAutoFormTestId(testIdPrefix, 'json-editor')}
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
  renderSummary?: (payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode;
  testIdPrefix: string;
}) {
  const payloadText = safeStringify(payload);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] lg:items-start lg:gap-10">
      {/*
        The form column's top-level rhythm is driven by `formSpacing.form`
        so every root sibling (fields, sections, Submit) is separated by
        the same token the `<Form>` primitive applies internally. Keeping
        the two entry points on the same token means Submit always sits
        one `form` step below the last section regardless of whether the
        preceding child is a leaf field or a nested group.
      */}
      <div className={`min-w-0 lg:pr-2 ${formSpacing.form}`}>{children}</div>
      <aside
        className="min-w-0 lg:sticky lg:top-6 lg:self-start"
        data-testid={buildAutoFormTestId(testIdPrefix, 'summary')}
      >
        {renderSummary ? (
          renderSummary(payload, context)
        ) : (
          <JsonBlock
            description="Payload preview for the request AutoForm is preparing. On wider screens this stays pinned on the right, and it drops below the form when space gets tight."
            jsonText={payloadText}
            title="Summary"
          />
        )}
      </aside>
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
  jsonEditorError?: string;
  jsonText: string;
  mode: AutoFormMode;
  modes: AutoFormMode[];
  onFormatJson: () => void;
  onJsonTextChange: (value: string) => void;
  onModeChange: (mode: AutoFormMode) => void;
  onResetJson: () => void;
  payload: unknown;
  renderSummary?: (payload: unknown, context: AutoFormSummaryContext<T>) => React.ReactNode;
  summaryContext: AutoFormSummaryContext<T>;
  renderFormMode: (mode: Exclude<AutoFormMode, 'json'>) => React.ReactNode;
  showSummary: boolean;
  testIdPrefix: string;
}) {
  const renderModeBody = React.useCallback(
    (targetMode: AutoFormMode) => {
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
    },
    [
      bestEffort,
      jsonEditorError,
      jsonText,
      onFormatJson,
      onJsonTextChange,
      onResetJson,
      payload,
      renderFormMode,
      renderSummary,
      showSummary,
      summaryContext,
    ]
  );

  if (modes.length <= 1) {
    return <>{renderModeBody(mode)}</>;
  }

  return (
    <MotionConfig reducedMotion="always">
      <Tabs
        onValueChange={(value) => onModeChange(value as AutoFormMode)}
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
              {tabMode === 'json' ? 'JSON' : tabMode === 'simple' ? 'Simple' : 'Advanced'}
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
