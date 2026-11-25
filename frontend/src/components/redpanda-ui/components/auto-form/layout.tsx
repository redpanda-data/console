'use client';

import type React from 'react';
import { Button } from '../button';
import { FieldLabel } from '../field';
import { hasSlotContent } from '../../lib/has-slot-content';
import { cn } from '../../lib/utils';
import { headingLevelForDepth } from './depth';
import { formSpacing } from './form-spacing';
import { DepthHeading, FormDepthProvider, useFormDepth } from './layout-context';

export interface FormLayoutProps extends Omit<React.ComponentProps<'form'>, 'children'> {
  children?: React.ReactNode | undefined;
  ref?: React.Ref<HTMLFormElement> | undefined;
  testId?: string | undefined;
}

export function FormLayout({ children, className, testId, ref, ...formProps }: FormLayoutProps) {
  return (
    <form className={cn(formSpacing.form, className)} data-testid={testId} ref={ref} {...formProps}>
      <FormDepthProvider depth={0}>{children}</FormDepthProvider>
    </form>
  );
}

export interface FormSectionProps {
  children?: React.ReactNode | undefined;
  className?: string | undefined;
  description?: React.ReactNode | undefined;
  /** Override divider visibility. Defaults to true when a title is present. */
  divider?: boolean | undefined;
  required?: boolean | undefined;
  testId?: string | undefined;
  title?: React.ReactNode | undefined;
}

export function FormSection({ title, description, divider, required, testId, className, children }: FormSectionProps) {
  const depth = useFormDepth();
  const hasHeader = hasSlotContent(title) || hasSlotContent(description);
  const showDivider = hasHeader && (divider ?? hasSlotContent(title));
  const level = headingLevelForDepth(depth);

  return (
    <section className={cn(formSpacing.field, className)} data-testid={testId}>
      {hasHeader ? (
        <div className={cn(formSpacing.sectionHeader, showDivider && formSpacing.sectionDivider)}>
          {hasSlotContent(title) ? (
            <div className="flex items-center gap-2">
              <DepthHeading level={level}>{title}</DepthHeading>
              {required === true ? <span className="text-body-sm text-destructive">*</span> : null}
            </div>
          ) : null}
          {hasSlotContent(description) ? <div className="text-body-sm text-subtle">{description}</div> : null}
        </div>
      ) : null}
      <FormDepthProvider depth={depth + 1}>
        <div className={formSpacing.field}>{children}</div>
      </FormDepthProvider>
    </section>
  );
}

export interface FormFieldProps {
  children: React.ReactNode;
  className?: string | undefined;
  error?: React.ReactNode | undefined;
  helpText?: React.ReactNode | undefined;
  htmlFor?: string | undefined;
  label?: React.ReactNode | undefined;
  required?: boolean | undefined;
  testId?: string | undefined;
}

export function FormField({ label, helpText, error, required, htmlFor, testId, className, children }: FormFieldProps) {
  let supportingContent: React.ReactNode = null;
  if (hasSlotContent(error)) {
    supportingContent = <span className="text-body-sm text-destructive">{error}</span>;
  } else if (hasSlotContent(helpText)) {
    supportingContent = <span className="text-body-sm text-subtle">{helpText}</span>;
  }

  return (
    <div className={cn(formSpacing.labelStack, className)} data-testid={testId}>
      {hasSlotContent(label) ? (
        <FieldLabel htmlFor={htmlFor}>
          <span className="text-label font-semibold">{label}</span>
          {required === true ? <span className="text-body-sm text-destructive">*</span> : null}
        </FieldLabel>
      ) : null}
      {children}
      {supportingContent}
    </div>
  );
}

export interface FormSubmitProps extends React.ComponentProps<typeof Button> {
  children?: React.ReactNode | undefined;
  ref?: React.Ref<HTMLButtonElement> | undefined;
}

export function FormSubmit({ children = 'Submit', type = 'submit', ref, ...props }: FormSubmitProps) {
  return (
    <Button ref={ref} type={type} {...props}>
      {children}
    </Button>
  );
}
