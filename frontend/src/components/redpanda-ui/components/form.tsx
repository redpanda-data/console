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
import { Heading, Text } from './typography';
import { cn, type SharedProps } from '../lib/utils';

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

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => (
  <FormFieldContext.Provider value={{ name: props.name }}>
    <Controller {...props} />
  </FormFieldContext.Provider>
);

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

interface FormItemProps extends React.ComponentProps<'div'>, VariantProps<typeof formItemVariants>, SharedProps {}

function FormItem({ className, layout, spacing, testId, ...props }: FormItemProps) {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
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
}: React.ComponentProps<'label'> & { required?: boolean }) {
  const { error, formItemId } = useFormField();

  return (
    <Label
      className={cn('data-[error=true]:text-destructive', className)}
      data-error={!!error}
      data-slot="form-label"
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required ? (
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

  return useRender({
    render: element,
    props: mergeProps<'div'>(
      {
        'aria-describedby': error ? `${formDescriptionId} ${formMessageId}` : `${formDescriptionId}`,
        'aria-invalid': !!error,
        'data-slot': 'form-control',
        id: formItemId,
      } as useRender.ElementProps<'div'>,
      props
    ),
  });
}

// Rendered as <div> (not <p>) so block-level children don't trip validateDOMNesting.
function FormDescription({ className, ...props }: React.ComponentProps<'div'>) {
  const { formDescriptionId } = useFormField();

  return (
    <div
      className={cn('text-muted-foreground text-xs', className)}
      data-slot="form-description"
      id={formDescriptionId}
      {...props}
    />
  );
}

function FormMessage({ className, ...props }: React.ComponentProps<'div'>) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? '') : props.children;

  if (!body) {
    return null;
  }

  return (
    <div className={cn('text-destructive text-sm', className)} data-slot="form-message" id={formMessageId} {...props}>
      {body}
    </div>
  );
}

interface FormContainerProps extends React.ComponentProps<'form'>, VariantProps<typeof formVariants> {
  testId?: string;
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
  title?: string;
  description?: string;
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
      {title || description ? (
        <div className="mb-4">
          {title ? (
            <Heading className="font-medium text-lg" level={3}>
              {title}
            </Heading>
          ) : null}
          {description ? <Text className="mt-1 text-muted-foreground text-sm">{description}</Text> : null}
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
  label?: string;
  description?: string;
  required?: boolean;
  layout?: FormItemProps['layout'];
  descriptionPosition?: 'top' | 'bottom';
  children: (field: ControllerRenderProps<TFieldValues, TName>) => React.ReactElement;
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
}: SimpleFormFieldProps<TFieldValues, TName> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <FormField
      {...fieldProps}
      render={({ field }) => (
        <FormItem layout={layout} ref={ref}>
          {label ? (
            <FormLabel className="leading-normal" required={required}>
              {label}
            </FormLabel>
          ) : null}
          {description && descriptionPosition === 'top' ? (
            <FormDescription className="leading-snug">{description}</FormDescription>
          ) : null}
          <FormControl>{children(field)}</FormControl>
          {description && descriptionPosition === 'bottom' ? (
            <FormDescription className="leading-snug">{description}</FormDescription>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  FormContainer,
  FormSection,
  SimpleFormField,
};
