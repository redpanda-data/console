'use client';

import React from 'react';

import { formSpacing } from './form-spacing';
import { DepthHeading, FormDepthProvider, headingLevelForDepth, useFormDepth } from './layout-context';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { FieldLabel } from '../field';

export interface FormLayoutProps extends Omit<React.ComponentProps<'form'>, 'children'> {
  children?: React.ReactNode;
  testId?: string;
  ref?: React.Ref<HTMLFormElement>;
}

export function FormLayout({ children, className, testId, ref, ...formProps }: FormLayoutProps) {
  return (
    <form className={cn(formSpacing.form, className)} data-testid={testId} ref={ref} {...formProps}>
      <FormDepthProvider depth={0}>{children}</FormDepthProvider>
    </form>
  );
}

export interface FormSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Override divider visibility. Defaults to true when a title is present. */
  divider?: boolean;
  required?: boolean;
  testId?: string;
  className?: string;
  children?: React.ReactNode;
}

export function FormSection({ title, description, divider, required, testId, className, children }: FormSectionProps) {
  const depth = useFormDepth();
  const hasHeader = Boolean(title) || Boolean(description);
  const showDivider = hasHeader && (divider ?? Boolean(title));
  const level = headingLevelForDepth(depth);

  return (
    <section className={cn(formSpacing.field, className)} data-testid={testId}>
      {hasHeader ? (
        <div className={cn(formSpacing.sectionHeader, showDivider && formSpacing.sectionDivider)}>
          {title ? (
            <div className="flex items-center gap-2">
              <DepthHeading className="font-medium" level={level}>
                {title}
              </DepthHeading>
              {required ? <span className="text-body-sm text-destructive">*</span> : null}
            </div>
          ) : null}
          {description ? <div className="text-body-sm text-muted-foreground">{description}</div> : null}
        </div>
      ) : null}
      <FormDepthProvider depth={depth + 1}>
        <div className={formSpacing.field}>{children}</div>
      </FormDepthProvider>
    </section>
  );
}

export interface FormFieldProps {
  label?: React.ReactNode;
  helpText?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  testId?: string;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, helpText, error, required, htmlFor, testId, className, children }: FormFieldProps) {
  return (
    <div className={cn(formSpacing.labelStack, className)} data-testid={testId}>
      {label ? (
        <FieldLabel className="flex items-center gap-2" htmlFor={htmlFor}>
          <span className="font-semibold text-label">{label}</span>
          {required ? <span className="text-body-sm text-destructive">*</span> : null}
        </FieldLabel>
      ) : null}
      {children}
      {error ? (
        <span className="text-body-sm text-destructive">{error}</span>
      ) : helpText ? (
        <span className="text-body-sm text-muted-foreground">{helpText}</span>
      ) : null}
    </div>
  );
}

export interface FormSubmitProps extends React.ComponentProps<typeof Button> {
  children?: React.ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

export function FormSubmit({ children = 'Submit', type = 'submit', ref, ...props }: FormSubmitProps) {
  return (
    <Button ref={ref} type={type} {...props}>
      {children}
    </Button>
  );
}
