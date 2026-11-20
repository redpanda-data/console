'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, useContext, useId } from 'react';
import type { LabelProps } from './label';
import { labelStyles } from './label/label-styles';
import { Separator } from './separator';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';

interface FieldContextValue {
  errorId: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue>({ invalid: false, errorId: undefined });

/** Field-level validation state for child controls: `invalid` for aria-invalid, `errorId` for aria-describedby. */
export function useFieldContext() {
  return useContext(FieldContext);
}

function FieldSet({ className, testId, ...props }: React.ComponentProps<'fieldset'> & SharedProps) {
  return (
    <fieldset
      className={cn(
        'flex flex-col gap-6',
        'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className
      )}
      data-slot="field-set"
      data-testid={testId}
      {...props}
    />
  );
}

function FieldLegend({
  className,
  variant = 'legend',
  ...props
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' | undefined }) {
  return (
    <legend
      className={cn(
        'mb-3 font-medium',
        'data-[variant=legend]:text-body-lg',
        'data-[variant=label]:text-body',
        className
      )}
      data-slot="field-legend"
      data-variant={variant}
      {...props}
    />
  );
}

function FieldGroup({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 [&>[data-slot=field-group]]:gap-4',
        className
      )}
      data-slot="field-group"
      data-testid={testId}
      {...props}
    />
  );
}

const fieldVariants = cva('group/field flex w-full gap-3 data-[invalid=true]:text-destructive', {
  variants: {
    orientation: {
      vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
      horizontal: [
        'flex-row items-center',
        '[&>[data-slot=field-label]]:flex-auto',
        'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
      responsive: [
        'flex-col @md/field-group:flex-row @md/field-group:items-center [&>*]:w-full @md/field-group:[&>*]:w-auto [&>.sr-only]:w-auto',
        '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
        '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

export type FieldProps = React.ComponentProps<'div'> &
  VariantProps<typeof fieldVariants> &
  SharedProps & {
    'data-invalid'?: boolean | 'true' | 'false' | undefined;
  };

function Field({ className, orientation = 'vertical', testId, ...props }: FieldProps) {
  const invalid = props['data-invalid'] === true || props['data-invalid'] === 'true';
  const errorId = useId();
  const ctx: FieldContextValue = { invalid, errorId: invalid ? errorId : undefined };

  return (
    <FieldContext.Provider value={ctx}>
      <div
        className={cn(fieldVariants({ orientation }), className)}
        data-orientation={orientation}
        data-slot="field"
        data-testid={testId}
        {...props}
      />
    </FieldContext.Provider>
  );
}

function FieldContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('group/field-content flex flex-1 flex-col gap-1.5 leading-snug', className)}
      data-slot="field-content"
      {...props}
    />
  );
}

function FieldLabel({
  className,
  children,
  htmlFor,
  required,
  inset,
  invalid,
  size,
  surface,
  variant,
  testId,
  ...props
}: LabelProps & { required?: boolean | undefined }) {
  return (
    <label
      className={cn(
        labelStyles({ inset, invalid, size, surface, variant }),
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4',
        'has-data-[checked]:border-primary has-data-[checked]:bg-primary-wash',
        className
      )}
      data-slot="field-label"
      data-surface={surface}
      data-testid={testId}
      htmlFor={htmlFor}
      {...props}
    >
      {children}
      {required === true ? (
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      ) : null}
    </label>
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex w-fit items-center gap-2 text-label group-data-[disabled=true]/field:opacity-50', className)}
      data-slot="field-label"
      {...props}
    />
  );
}

// Rendered as <div> (not <p>) so block-level children don't trip validateDOMNesting.
function FieldDescription({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'text-body text-subtle group-has-[[data-orientation=horizontal]]/field:text-balance',
        'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5',
        '[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
        className
      )}
      data-slot="field-description"
      data-testid={testId}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode | undefined;
}) {
  return (
    <div
      className={cn('relative -my-2 h-5 text-body group-data-[variant=outline]/field-group:-mb-2', className)}
      data-content={hasSlotContent(children)}
      data-slot="field-separator"
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {hasSlotContent(children) ? (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-subtle"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      ) : null}
    </div>
  );
}

type FieldErrorProps = React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string | undefined } | undefined>;
} & SharedProps;

function fieldErrorContent(children: React.ReactNode, errors: FieldErrorProps['errors']): React.ReactNode {
  if (hasSlotContent(children)) {
    return children;
  }
  const messages = [
    ...new Set(
      errors?.flatMap((error) => {
        const message = error?.message;
        return message === undefined || message === '' ? [] : [message];
      })
    ),
  ];
  if (messages.length === 0) {
    return null;
  }
  if (messages.length === 1) {
    return messages[0];
  }
  return (
    <ul className="ml-4 flex list-disc flex-col gap-1">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function FieldError({ className, children, errors, testId, ...props }: FieldErrorProps) {
  const { errorId } = useContext(FieldContext);
  const content = fieldErrorContent(children, errors);

  if (!hasSlotContent(content)) {
    return null;
  }

  return (
    <div
      className={cn('text-body font-normal text-destructive', className)}
      data-slot="field-error"
      data-testid={testId}
      id={errorId}
      role="alert"
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldTitle,
};
