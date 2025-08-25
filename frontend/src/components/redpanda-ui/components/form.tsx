'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { type Label as LabelPrimitive, Slot as SlotPrimitive } from 'radix-ui';
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
import { cn } from '../lib/utils';

const Form = FormProvider;

// Form layout variants for different use cases
const formVariants = cva('', {
  variants: {
    layout: {
      default: 'space-y-6',
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
    layout: 'default',
    width: 'auto',
  },
});

// Form item variants for consistent spacing and layouts
const formItemVariants = cva('', {
  variants: {
    layout: {
      default: 'grid gap-2',
      horizontal: 'flex items-center gap-3',
      'horizontal-start': 'flex items-start gap-3',
      card: 'flex flex-row items-start gap-3 p-4',
      'card-horizontal': 'flex flex-row items-start justify-between p-4',
    },
    spacing: {
      none: 'gap-0',
      tight: 'gap-1',
      default: 'gap-2',
      loose: 'gap-4',
    },
  },
  defaultVariants: {
    layout: 'default',
    spacing: 'default',
  },
});

// Form section variants for grouping related fields
const formSectionVariants = cva('', {
  variants: {
    variant: {
      default: '',
      card: 'rounded-md border bg-card p-4',
      'card-elevated': 'rounded-md border bg-card p-4 shadow-sm',
      divider: 'border-t pt-6',
    },
    spacing: {
      none: '',
      default: 'space-y-4',
      loose: 'space-y-6',
    },
  },
  defaultVariants: {
    variant: 'default',
    spacing: 'default',
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
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

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

interface FormItemProps extends React.ComponentProps<'div'>, VariantProps<typeof formItemVariants> {
  testId?: string;
}

const FormItem = React.forwardRef<HTMLDivElement, FormItemProps>(
  ({ className, layout, spacing, testId, ...props }, ref) => {
    const id = React.useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <div
          ref={ref}
          data-slot="form-item"
          data-testid={testId}
          className={cn(formItemVariants({ layout, spacing }), className)}
          {...props}
        />
      </FormItemContext.Provider>
    );
  },
);

FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      data-slot="form-label"
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );
});

FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<
  React.ElementRef<typeof SlotPrimitive.Slot>,
  React.ComponentProps<typeof SlotPrimitive.Slot>
>((props, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <SlotPrimitive.Slot
      ref={ref}
      data-slot="form-control"
      id={formItemId}
      aria-describedby={!error ? `${formDescriptionId}` : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
});

FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef<HTMLParagraphElement, React.ComponentProps<'p'>>(
  ({ className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();

    return (
      <p
        ref={ref}
        data-slot="form-description"
        id={formDescriptionId}
        className={cn('text-muted-foreground text-xs', className)}
        {...props}
      />
    );
  },
);

FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<HTMLParagraphElement, React.ComponentProps<'p'>>(
  ({ className, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const body = error ? String(error?.message ?? '') : props.children;

    if (!body) {
      return null;
    }

    return (
      <p
        ref={ref}
        data-slot="form-message"
        id={formMessageId}
        className={cn('text-destructive text-sm', className)}
        {...props}
      >
        {body}
      </p>
    );
  },
);

FormMessage.displayName = 'FormMessage';

// New components for better form organization

interface FormContainerProps extends React.ComponentProps<'form'>, VariantProps<typeof formVariants> {
  testId?: string;
}

const FormContainer = React.forwardRef<HTMLFormElement, FormContainerProps>(
  ({ className, layout, width, testId, ...props }, ref) => {
    return (
      <form
        ref={ref}
        data-slot="form-container"
        data-testid={testId}
        className={cn(formVariants({ layout, width }), className)}
        {...props}
      />
    );
  },
);

FormContainer.displayName = 'FormContainer';

interface FormSectionProps extends React.ComponentProps<'div'>, VariantProps<typeof formSectionVariants> {
  title?: string;
  description?: string;
  testId?: string;
}

const FormSection = React.forwardRef<HTMLDivElement, FormSectionProps>(
  ({ className, variant, spacing, title, description, children, testId, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="form-section"
        data-testid={testId}
        className={cn(formSectionVariants({ variant, spacing }), className)}
        {...props}
      >
        {(title || description) && (
          <div className="mb-4">
            {title && <h3 className="text-lg font-medium">{title}</h3>}
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
        )}
        {children}
      </div>
    );
  },
);

FormSection.displayName = 'FormSection';

// Simplified field component that combines common patterns
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
  ...props
}: SimpleFormFieldProps<TFieldValues, TName> & { ref?: React.Ref<HTMLDivElement> }) {
  const { ref, ...fieldProps } = props as SimpleFormFieldProps<TFieldValues, TName> & {
    ref?: React.Ref<HTMLDivElement>;
  };

  return (
    <FormField
      {...fieldProps}
      render={({ field }) => (
        <FormItem ref={ref} layout={layout}>
          {label && (
            <FormLabel className="leading-normal" required={required}>
              {label}
            </FormLabel>
          )}
          {description && descriptionPosition === 'top' && (
            <FormDescription className="leading-snug">{description}</FormDescription>
          )}
          <FormControl>{children(field)}</FormControl>
          {description && descriptionPosition === 'bottom' && (
            <FormDescription className="leading-snug">{description}</FormDescription>
          )}
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
