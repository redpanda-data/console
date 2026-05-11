'use client';

import React from 'react';

import { formSpacing } from './form-spacing';
import { FormDepthProvider, headingLevelForDepth, useFormDepth } from './layout-context';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { FieldLabel } from '../field';
import { Heading, Text } from '../typography';

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
              <Heading className="font-medium" level={level}>
                {title}
              </Heading>
              {required ? (
                <Text as="span" className="text-destructive" variant="small">
                  *
                </Text>
              ) : null}
            </div>
          ) : null}
          {description ? (
            <Text className="text-muted-foreground" variant="small">
              {description}
            </Text>
          ) : null}
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
          <Text as="span" variant="labelStrongSmall">
            {label}
          </Text>
          {required ? (
            <Text as="span" className="text-destructive" variant="small">
              *
            </Text>
          ) : null}
        </FieldLabel>
      ) : null}
      {children}
      {error ? (
        <Text as="span" className="text-destructive" variant="small">
          {error}
        </Text>
      ) : helpText ? (
        <Text as="span" className="text-muted-foreground" variant="small">
          {helpText}
        </Text>
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
