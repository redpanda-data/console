'use client';

import { AlertCircle, ChevronDown, CircleHelp, ExternalLink, PlusIcon, TrashIcon } from 'lucide-react';
import React from 'react';

import { useAutoFormRuntimeContext } from './context';
import type { ArrayElementWrapperProps, ArrayWrapperProps, FieldWrapperProps, ObjectWrapperProps } from './core-types';
import { formSpacing } from './form-spacing';
import { getFieldDescriptionText, getFieldDocsUrl, getFieldHelpText, getFieldUiConfig } from './helpers';
import { FormDepthProvider, headingLevelForDepth, useFormDepth } from './layout-context';
import { getAutoFormFieldTestId } from './test-ids';
import type { SharedProps } from '../../lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { Button } from '../button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../collapsible';
import { Field, FieldDescription, FieldError, FieldLabel } from '../field';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { Heading, Text } from '../typography';

const REGEX_ERROR_PATTERN = /regex pattern\s*`([^`]+)`/;

export const Form = React.forwardRef<HTMLFormElement, React.ComponentProps<'form'> & SharedProps>(
  ({ children, testId, ...props }, ref) => (
    <form className={formSpacing.form} data-testid={testId} ref={ref} {...props}>
      <FormDepthProvider depth={0}>{children}</FormDepthProvider>
    </form>
  )
);
Form.displayName = 'Form';

export const ArrayElementWrapper: React.FC<
  ArrayElementWrapperProps & {
    testId?: string;
    removeButtonTestId?: string;
  }
> = ({ children, index, onRemove, removeButtonTestId, testId }) => (
  <div className={index > 0 ? `relative ${formSpacing.arrayItemSeparator}` : 'relative'} data-testid={testId}>
    <Button
      aria-label="Remove item"
      className="absolute top-4 right-0"
      onClick={onRemove}
      size="icon-sm"
      testId={removeButtonTestId}
      type="button"
      variant="ghost"
    >
      <TrashIcon className="h-4 w-4" />
    </Button>
    <div className="pr-10">{children}</div>
  </div>
);

export const ArrayWrapper: React.FC<
  ArrayWrapperProps & {
    addButtonTestId?: string;
    testId?: string;
  }
> = ({ label, children, onAddItem, addButtonTestId, testId }) => (
  <div className={formSpacing.field} data-testid={testId}>
    {children}
    <Button onClick={onAddItem} size="sm" testId={addButtonTestId} type="button" variant="outline">
      <PlusIcon className="h-4 w-4" />
      {label ? `Add ${label}` : 'Add item'}
    </Button>
  </div>
);

export const ErrorMessage: React.FC<{ error: string }> = ({ error }) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>AutoForm error</AlertTitle>
    <AlertDescription>{error}</AlertDescription>
  </Alert>
);

function augmentError(
  error: FieldWrapperProps['error'],
  field: FieldWrapperProps['field']
): FieldWrapperProps['error'] {
  if (!(typeof error === 'string' && REGEX_ERROR_PATTERN.test(error))) {
    return error;
  }
  const uiConfig = getFieldUiConfig(field);
  if (uiConfig.example) {
    return `${error}\nExample: ${uiConfig.example}`;
  }
  return error;
}

export const FieldWrapper: React.FC<FieldWrapperProps> = ({ label, children, id, field, error: rawError }) => {
  const { testIdPrefix } = useAutoFormRuntimeContext();
  const isCompact = Boolean((field.fieldConfig?.customData as Record<string, unknown> | undefined)?.compactRow);
  const tooltipText = isCompact ? '' : getFieldHelpText(field);
  const helpText = isCompact ? undefined : getFieldDescriptionText(field);
  const docsUrl = isCompact ? undefined : getFieldDocsUrl(field);
  const error = augmentError(rawError, field);
  const isDisabled = Boolean(field.fieldConfig?.inputProps?.disabled);
  const hasVisibleLabel = !(typeof label === 'string' && label.trim().length === 0);
  const fallbackLabel =
    typeof field.fieldConfig?.label === 'string' && field.fieldConfig.label.trim().length > 0
      ? field.fieldConfig.label
      : field.key;
  const fieldTestId = getAutoFormFieldTestId(testIdPrefix, id);

  // Match the non-AutoForm usage pattern in managed-create-form.tsx:
  // `<Field>` with label / control / description / error as *direct*
  // siblings, so the Field component's native `gap-3` drives the
  // label → input → description → error rhythm. The previous
  // `<Field gap-2><FieldContent gap-2>` nesting produced a cramped
  // 8px label/input gap and misaligned the internal rhythm from every
  // manually-constructed form in the app — users could spot the
  // AutoForm at a glance from the tighter stack alone.
  return (
    <Field data-disabled={isDisabled} data-invalid={Boolean(error)} testId={fieldTestId}>
      {isCompact ? null : (
        <div className="flex items-center gap-2">
          <FieldLabel className={hasVisibleLabel ? 'items-center gap-2' : 'sr-only'} htmlFor={id}>
            <Text as="span" variant="labelStrongSmall">
              {hasVisibleLabel ? label : fallbackLabel}
            </Text>
            {field.required ? (
              <Text as="span" className="text-destructive" variant="small">
                *
              </Text>
            ) : null}
          </FieldLabel>
          {tooltipText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Field help"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition hover:text-foreground"
                  data-testid={getAutoFormFieldTestId(testIdPrefix, id, 'help')}
                  type="button"
                >
                  <CircleHelp className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                className="max-w-sm text-pretty text-xs"
                testId={getAutoFormFieldTestId(testIdPrefix, id, 'help-content')}
              >
                {tooltipText}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}
      {children}
      {error ? (
        <FieldError testId={getAutoFormFieldTestId(testIdPrefix, id, 'error')}>{error}</FieldError>
      ) : (helpText || docsUrl) && !isCompact ? (
        <FieldDescription testId={getAutoFormFieldTestId(testIdPrefix, id, 'description')}>
          {helpText ? <span>{helpText}</span> : null}
          {docsUrl ? (
            <>
              {helpText ? ' ' : null}
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                data-testid={getAutoFormFieldTestId(testIdPrefix, id, 'docs-link')}
                href={docsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Learn more
                <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            </>
          ) : null}
        </FieldDescription>
      ) : null}
    </Field>
  );
};

export const ObjectWrapper: React.FC<ObjectWrapperProps & { testId?: string; hasError?: boolean }> = ({
  label,
  children,
  field,
  testId,
  hasError,
}) => {
  const depth = useFormDepth();
  const headingLevel = headingLevelForDepth(depth);
  const helpText = getFieldDescriptionText(field);
  const hasVisibleLabel = !(typeof label === 'string' && label.trim().length === 0);
  const customData = (field.fieldConfig?.customData ?? {}) as Record<string, unknown>;
  const isCollapsible = Boolean(customData.collapsible);
  // Divider under a section header. Defaults to true for parity with the
  // historical ObjectWrapper behavior. Consumers can opt out by setting
  // `customData.showDivider = false` — same escape hatch as FormSection's
  // `divider` prop so both entry points agree on when a rule renders.
  const showDivider = customData.showDivider !== false && hasVisibleLabel;
  const [isOpen, setIsOpen] = React.useState(false);

  // Auto-expand when section has validation errors
  React.useEffect(() => {
    if (hasError && !isOpen) {
      setIsOpen(true);
    }
  }, [hasError, isOpen]);

  if (isCollapsible && hasVisibleLabel) {
    return (
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <section className={formSpacing.field} data-testid={testId}>
          <CollapsibleTrigger asChild>
            <button
              className={
                showDivider
                  ? `flex w-full items-center justify-between text-left ${formSpacing.sectionDivider}`
                  : 'flex w-full items-center justify-between text-left'
              }
              type="button"
            >
              <div className={formSpacing.sectionHeader}>
                <div className="flex items-center gap-2">
                  <Heading className="font-medium" level={headingLevel}>
                    {label}
                  </Heading>
                  {field.required ? (
                    <Text as="span" className="text-destructive" variant="small">
                      *
                    </Text>
                  ) : null}
                </div>
                {helpText ? (
                  <Text className="text-muted-foreground" variant="small">
                    {helpText}
                  </Text>
                ) : null}
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <FormDepthProvider depth={depth + 1}>
              <div className={formSpacing.field}>{children}</div>
            </FormDepthProvider>
          </CollapsibleContent>
        </section>
      </Collapsible>
    );
  }

  return (
    <section className={formSpacing.field} data-testid={testId}>
      {hasVisibleLabel ? (
        <div
          className={
            showDivider ? `${formSpacing.sectionHeader} ${formSpacing.sectionDivider}` : formSpacing.sectionHeader
          }
        >
          <div className="flex items-center gap-2">
            <Heading className="font-medium" level={headingLevel}>
              {label}
            </Heading>
            {field.required ? (
              <Text as="span" className="text-destructive" variant="small">
                *
              </Text>
            ) : null}
          </div>
          {helpText ? (
            <Text className="text-muted-foreground" variant="small">
              {helpText}
            </Text>
          ) : null}
        </div>
      ) : null}
      <FormDepthProvider depth={depth + 1}>
        <div className={formSpacing.field}>{children}</div>
      </FormDepthProvider>
    </section>
  );
};

export const SubmitButton: React.FC<{ children: React.ReactNode; testId?: string }> = ({ children, testId }) => (
  <Button testId={testId} type="submit">
    {children}
  </Button>
);
