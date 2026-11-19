'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';
import {
  Controller,
  type ControllerProps,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from 'react-hook-form';
import { Label } from './label';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type DataAttributes, type SharedProps } from '../lib/utils';

const Form = FormProvider;

const formVariants = cva('', {
  variants: {
    layout: {
      vertical: 'space-y-6',
      compact: 'space-y-4',
      loose: 'space-y-8',
      grid: 'grid gap-6',
      'grid-cols-2': 'grid grid-cols-2 gap-6',
    },
    width: {
      auto: '',
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      full: 'w-full',
    },
  },
  defaultVariants: {
    layout: 'vertical',
    width: 'auto',
  },
});

const formItemVariants = cva('', {
  variants: {
    layout: {
      vertical: 'grid gap-2',
      horizontal: 'flex items-center gap-3',
      'horizontal-start': 'flex items-start gap-3',
      card: 'flex flex-row items-start gap-3 p-4',
      'card-horizontal': 'flex flex-row items-start justify-between p-4',
    },
    spacing: {
      none: 'gap-0',
      tight: 'gap-1',
      md: 'gap-2',
      loose: 'gap-4',
    },
  },
  defaultVariants: {
    layout: 'vertical',
    spacing: 'md',
  },
});

const formSectionVariants = cva('', {
  variants: {
    variant: {
      standard: '',
      card: 'rounded-md border bg-card p-4',
      'card-elevated': 'rounded-md border bg-card p-4 shadow-sm',
      divider: 'border-t pt-6',
    },
    spacing: {
      none: '',
      md: 'space-y-4',
      loose: 'space-y-6',
    },
  },
  defaultVariants: {
    variant: 'standard',
    spacing: 'md',
  },
});

const FormFieldContext = React.createContext<string | null>(null);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => (
  <FormFieldContext.Provider value={props.name}>
    <Controller {...props} />
  </FormFieldContext.Provider>
);

const useFormField = () => {
  const name = React.useContext(FormFieldContext);
  const id = React.useContext(FormItemContext);
  if (name === null) {
    throw new Error('useFormField should be used within <FormField>');
  }
  if (id === null) {
    throw new Error('useFormField should be used within <FormItem>');
  }
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name });
  const fieldState = getFieldState(name, formState);

  return {
    id,
    name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

const FormItemContext = React.createContext<string | null>(null);

interface FormItemProps extends React.ComponentProps<'div'>, VariantProps<typeof formItemVariants>, SharedProps {}

function FormItem({ className, layout, spacing, testId, ...props }: FormItemProps) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={id}>
      <div
        className={cn(formItemVariants({ layout, spacing }), className)}
        data-slot="form-item"
        data-testid={testId}
        {...props}
      />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  required,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Label>, 'invalid'> & { required?: boolean | undefined }) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      className={className}
      data-error={error !== undefined}
      data-slot="form-label"
      htmlFor={formItemId}
      invalid={error !== undefined}
      {...props}
    >
      {children}
      {required === true ? (
        <span aria-hidden="true" className="ml-1 text-destructive">
          *
        </span>
      ) : null}
    </Label>
  );
}

// Composes the field's ARIA + id props onto a single control (via `render` prop or child element).
function FormControl({ render, children, ...props }: useRender.ComponentProps<'div'>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  const element = render ?? (React.isValidElement(children) ? children : <div>{children}</div>);

  const elementProps = {
    'aria-describedby': error === undefined ? formDescriptionId : `${formDescriptionId} ${formMessageId}`,
    'aria-invalid': error !== undefined,
    'data-slot': 'form-control',
    id: formItemId,
  } satisfies useRender.ElementProps<'div'> & DataAttributes;

  return useRender({
    render: element,
    props: mergeProps<'div'>(elementProps, props),
  });
}

// Rendered as <div> (not <p>) so block-level children don't trip validateDOMNesting.
function FormDescription({ className, ...props }: React.ComponentProps<'div'>) {
  const { formDescriptionId } = useFormField();

  return (
    <div
      className={cn('text-body-sm text-subtle', className)}
      data-slot="form-description"
      id={formDescriptionId}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<'div'>) {
  const { error, formMessageId } = useFormField();
  const body = error === undefined ? props.children : (error.message ?? '');

  if (!hasSlotContent(body)) {
    return null;
  }

  return (
    <div className={cn('text-body text-destructive', className)} data-slot="form-message" id={formMessageId} {...props}>
      {body}
    </div>
  );
}

interface FormContainerProps extends React.ComponentProps<'form'>, VariantProps<typeof formVariants> {
  testId?: string | undefined;
}

function FormContainer({ className, layout, width, testId, ...props }: FormContainerProps) {
  return (
    <form
      className={cn(formVariants({ layout, width }), className)}
      data-slot="form-container"
      data-testid={testId}
      {...props}
    />
  );
}

interface FormSectionProps extends React.ComponentProps<'div'>, VariantProps<typeof formSectionVariants>, SharedProps {
  description?: string | undefined;
  title?: string | undefined;
}

function FormSection({
  className,
  variant,
  spacing,
  title,
  description,
  children,
  testId,
  ...props
}: FormSectionProps) {
  return (
    <div
      className={cn(formSectionVariants({ variant, spacing }), className)}
      data-slot="form-section"
      data-testid={testId}
      {...props}
    >
      {(title !== undefined && title !== '') || (description !== undefined && description !== '') ? (
        <div className="mb-4">
          {title !== undefined && title !== '' ? <h3 className="text-heading-md">{title}</h3> : null}
          {description !== undefined && description !== '' ? (
            <div className="mt-1 text-body text-subtle">{description}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

interface SimpleFormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends Omit<ControllerProps<TFieldValues, TName>, 'render'> {
  children: (field: ControllerRenderProps<TFieldValues, TName>) => React.ReactElement;
  description?: string | undefined;
  descriptionPosition?: 'top' | 'bottom' | undefined;
  label?: string | undefined;
  layout?: FormItemProps['layout'] | undefined;
  required?: boolean | undefined;
}

function SimpleFormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  layout,
  descriptionPosition = 'bottom',
  children,
  ref,
  ...fieldProps
}: SimpleFormFieldProps<TFieldValues, TName> & { ref?: React.Ref<HTMLDivElement> | undefined }) {
  return (
    <FormField
      {...fieldProps}
      render={({ field }) => (
        <FormItem layout={layout} ref={ref}>
          {label !== undefined && label !== '' ? <FormLabel required={required}>{label}</FormLabel> : null}
          {description !== undefined && description !== '' && descriptionPosition === 'top' ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormControl>{children(field)}</FormControl>
          {description !== undefined && description !== '' && descriptionPosition === 'bottom' ? (
            <FormDescription>{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export {
  Form,
  FormContainer,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
  SimpleFormField,
  useFormField,
};
