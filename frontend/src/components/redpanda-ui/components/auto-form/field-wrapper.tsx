'use client';

// Copyright 2026 Redpanda Data, Inc.

import { clsx } from 'clsx';
import { AlertCircle, ChevronDown, CircleHelp, ExternalLink, PlusIcon, TrashIcon } from 'lucide-react';
import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '../alert';
import { Button } from '../button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../collapsible';
import { Field, FieldDescription, FieldError, FieldLabel } from '../field';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { hasSlotContent } from '../../lib/has-slot-content';
import { cn, type SharedProps } from '../../lib/utils';
import { useAutoForm } from './context';
import type { ArrayElementWrapperProps, ArrayWrapperProps, FieldWrapperProps, ObjectWrapperProps } from './core-types';
import { headingLevelForDepth } from './depth';
import { formSpacing } from './form-spacing';
import { getFieldDescriptionText, getFieldDocsUrl, getFieldHelpText } from './helpers';
import { DepthHeading, FormDepthProvider, useFormDepth } from './layout-context';
import { useAutoFormSubmitting } from './submission';
import { getAutoFormFieldTestId } from './test-ids';
import { getFieldUiConfig } from './ui-config';

const REGEX_ERROR_PATTERN = /regex pattern\s*`([^`]+)`/;

export const Form = ({
  children,
  testId,
  ref,
  ...props
}: React.ComponentProps<'form'> & SharedProps & { ref?: React.Ref<HTMLFormElement> | undefined }) => (
  <form className={formSpacing.form} data-testid={testId} ref={ref} {...props}>
    <FormDepthProvider depth={0}>{children}</FormDepthProvider>
  </form>
);
Form.displayName = 'Form';

export const ArrayElementWrapper: React.FC<
  ArrayElementWrapperProps & {
    testId?: string | undefined;
    removeButtonTestId?: string;
  }
> = ({ children, index, onRemove, removeButtonTestId, testId }) => (
  <div className={index > 0 ? clsx('relative', formSpacing.arrayItemSeparator) : 'relative'} data-testid={testId}>
    <Button
      aria-label="Remove item"
      className="absolute top-4 right-0"
      onClick={onRemove}
      size="icon-sm"
      testId={removeButtonTestId}
      type="button"
      variant="ghost"
    >
      <TrashIcon className="size-4" />
    </Button>
    <div className="pr-10">{children}</div>
  </div>
);

export const ArrayWrapper: React.FC<
  ArrayWrapperProps & {
    addButtonTestId?: string;
    testId?: string | undefined;
  }
> = ({ label, children, onAddItem, addButtonTestId, testId }) => (
  <div className={formSpacing.field} data-testid={testId}>
    {children}
    <Button onClick={onAddItem} size="sm" testId={addButtonTestId} type="button" variant="outline">
      <PlusIcon className="size-4" />
      {hasSlotContent(label) ? <>Add {label}</> : 'Add item'}
    </Button>
  </div>
);

export const ErrorMessage: React.FC<{ error: string }> = ({ error }) => (
  <Alert variant="destructive">
    <AlertCircle className="size-4" />
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
  const example = getFieldUiConfig(field).example;
  if (example !== undefined && example !== '') {
    return `${error}\nExample: ${example}`;
  }
  return error;
}

function FieldSupportingContent({
  error,
  id,
  field,
  isCompact,
  fallbackLabel,
}: Pick<FieldWrapperProps, 'error' | 'id' | 'field'> & { isCompact: boolean; fallbackLabel: string }) {
  const { testIdPrefix } = useAutoForm();
  if (hasSlotContent(error)) {
    return <FieldError testId={getAutoFormFieldTestId(testIdPrefix, id, 'error')}>{error}</FieldError>;
  }
  if (isCompact) {
    return null;
  }
  const helpText = getFieldDescriptionText(field);
  const docsUrl = getFieldDocsUrl(field);
  const hasHelpText = helpText !== undefined && helpText !== '';
  const hasDocsUrl = docsUrl !== undefined && docsUrl !== '';
  if (!(hasHelpText || hasDocsUrl)) {
    return null;
  }
  return (
    <FieldDescription testId={getAutoFormFieldTestId(testIdPrefix, id, 'description')}>
      {hasHelpText ? <span>{helpText}</span> : null}
      {hasDocsUrl ? (
        <>
          {hasHelpText ? ' ' : null}
          <a
            className="inline-flex items-center gap-1 text-primary link-inline transition-colors motion-reduce:transition-none"
            data-testid={getAutoFormFieldTestId(testIdPrefix, id, 'docs-link')}
            href={docsUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open documentation for {fallbackLabel}
            <ExternalLink aria-hidden className="size-3" />
          </a>
        </>
      ) : null}
    </FieldDescription>
  );
}

export const FieldWrapper: React.FC<FieldWrapperProps> = ({ label, children, id, field, error: rawError }) => {
  const { testIdPrefix } = useAutoForm();
  const isCompact = Boolean(field.fieldConfig?.customData?.['compactRow']);
  const tooltipText = isCompact ? '' : getFieldHelpText(field);
  const error = augmentError(rawError, field);
  const isDisabled = Boolean(field.fieldConfig?.inputProps?.['disabled']);
  const hasVisibleLabel = hasSlotContent(typeof label === 'string' ? label.trim() : label);
  const fallbackLabel =
    typeof field.fieldConfig?.label === 'string' && field.fieldConfig.label.trim().length > 0
      ? field.fieldConfig.label
      : field.key;
  const fieldTestId = getAutoFormFieldTestId(testIdPrefix, id);

  // Keep label/control/description/error as direct Field children so the Field's
  // native gap-3 drives the rhythm, matching manually-composed forms.
  return (
    <Field data-disabled={isDisabled} data-invalid={hasSlotContent(error)} testId={fieldTestId}>
      {isCompact ? null : (
        <div className="flex items-center gap-2">
          <FieldLabel className={hasVisibleLabel ? undefined : 'sr-only'} htmlFor={id}>
            <span className="text-label font-semibold">{hasVisibleLabel ? label : fallbackLabel}</span>
            {field.required ? <span className="text-body-sm text-destructive">*</span> : null}
          </FieldLabel>
          {tooltipText === '' ? null : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Field help"
                    data-testid={getAutoFormFieldTestId(testIdPrefix, id, 'help')}
                    shape="pill"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <CircleHelp className="size-4" />
                  </Button>
                }
              />
              <TooltipContent className="max-w-sm" testId={getAutoFormFieldTestId(testIdPrefix, id, 'help-content')}>
                {tooltipText}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
      {children}
      <FieldSupportingContent error={error} fallbackLabel={fallbackLabel} field={field} id={id} isCompact={isCompact} />
    </Field>
  );
};

function ObjectHeading({
  label,
  field,
  className,
}: Pick<ObjectWrapperProps, 'label' | 'field'> & { className?: string | undefined }) {
  const depth = useFormDepth();
  const helpText = getFieldDescriptionText(field);
  return (
    <div className={cn(formSpacing.sectionHeader, className)}>
      <div className="flex items-center gap-2">
        <DepthHeading level={headingLevelForDepth(depth)}>{label}</DepthHeading>
        {field.required ? <span className="text-body-sm text-destructive">*</span> : null}
      </div>
      {helpText !== undefined && helpText !== '' ? <div className="text-body-sm text-subtle">{helpText}</div> : null}
    </div>
  );
}

export const ObjectWrapper: React.FC<
  ObjectWrapperProps & { testId?: string | undefined; hasError?: boolean | undefined }
> = ({ label, children, field, testId, hasError }) => {
  const depth = useFormDepth();
  const hasVisibleLabel = hasSlotContent(typeof label === 'string' ? label.trim() : label);
  const customData = field.fieldConfig?.customData ?? {};
  const isCollapsible = Boolean(customData['collapsible']);
  // Defaults true; consumers opt out via customData.showDivider, mirroring FormSection's divider prop.
  const showDivider = customData['showDivider'] !== false && hasVisibleLabel;
  const [isOpen, setIsOpen] = React.useState(false);
  const open = hasError === true || isOpen;

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(hasError === true || nextOpen);
  };

  if (isCollapsible && hasVisibleLabel) {
    return (
      <Collapsible onOpenChange={handleOpenChange} open={open}>
        <section className={formSpacing.field} data-testid={testId}>
          <CollapsibleTrigger
            render={
              <Button
                className={
                  showDivider
                    ? clsx('flex w-full items-center justify-between text-left', formSpacing.sectionDivider)
                    : 'flex w-full items-center justify-between text-left'
                }
                type="button"
                variant="unstyled"
              >
                <ObjectHeading field={field} label={label} />
                <ChevronDown className="size-4 shrink-0 text-subtle transition-transform duration-200 motion-reduce:transition-none [[data-panel-open]_&]:rotate-180" />
              </Button>
            }
          />
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
        <ObjectHeading className={showDivider ? formSpacing.sectionDivider : undefined} field={field} label={label} />
      ) : null}
      <FormDepthProvider depth={depth + 1}>
        <div className={formSpacing.field}>{children}</div>
      </FormDepthProvider>
    </section>
  );
};

export const SubmitButton: React.FC<{ children: React.ReactNode; testId?: string | undefined }> = ({
  children,
  testId,
}) => {
  const isSubmitting = useAutoFormSubmitting();
  return (
    <Button focusableWhenDisabled={isSubmitting} isLoading={isSubmitting} testId={testId} type="submit">
      {children}
    </Button>
  );
};
