'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { createContext, useContext, useId, useMemo } from 'react';

import { Label } from './label';
import { Separator } from './separator';
import { cn, type SharedProps } from '../lib/utils';

interface FieldContextValue {
  invalid: boolean;
  errorId: string | undefined;
}

const FieldContext = createContext<FieldContextValue>({ invalid: false, errorId: undefined });

/**
 * Access field-level validation state from child components.
 * Returns `{ invalid, errorId }` — use `invalid` for `aria-invalid` and
 * `errorId` for `aria-describedby` on form controls.
 */
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
}: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' }) {
  return (
    <legend
      className={cn('mb-3 font-medium', 'data-[variant=legend]:text-base', 'data-[variant=label]:text-sm', className)}
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
        '@md/field-group:flex-row flex-col @md/field-group:items-center @md/field-group:[&>*]:w-auto [&>*]:w-full [&>.sr-only]:w-auto',
        '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
        '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

function Field({
  className,
  orientation = 'vertical',
  testId,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants> & SharedProps) {
  const dataProps = props as Record<string, unknown>;
  const invalid = dataProps['data-invalid'] === true || dataProps['data-invalid'] === 'true';
  const errorId = useId();
  const ctx = useMemo(() => ({ invalid, errorId: invalid ? errorId : undefined }), [invalid, errorId]);

  return (
    <FieldContext.Provider value={ctx}>
      {/* biome-ignore lint/a11y/useSemanticElements: part of field implementation */}
      <div
        className={cn(fieldVariants({ orientation }), className)}
        data-orientation={orientation}
        data-slot="field"
        data-testid={testId}
        role="group"
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

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4',
        'has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 dark:has-data-[state=checked]:bg-primary/10',
        className
      )}
      data-slot="field-label"
      {...props}
    />
  );
}

function FieldTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex w-fit items-center gap-2 font-medium text-sm leading-snug group-data-[disabled=true]/field:opacity-50',
        className
      )}
      data-slot="field-label"
      {...props}
    />
  );
}

// Rendered as <div> instead of <p> so consumers can nest block-level components
// (Text, Alert, Input, etc.) without triggering React's validateDOMNesting warnings.
function FieldDescription({ className, testId, ...props }: React.ComponentProps<'div'> & SharedProps) {
  return (
    <div
      className={cn(
        'font-normal text-muted-foreground text-sm leading-normal group-has-[[data-orientation=horizontal]]/field:text-balance',
        'nth-last-2:-mt-1 last:mt-0 [[data-variant=legend]+&]:-mt-1.5',
        '[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
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
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn('relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2', className)}
      data-content={!!children}
      data-slot="field-separator"
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children ? (
        <span
          className="relative mx-auto block w-fit bg-background px-2 text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      ) : null}
    </div>
  );
}

function FieldError({
  className,
  children,
  errors,
  testId,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>;
} & SharedProps) {
  const { errorId } = useContext(FieldContext);
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors?.length) {
      return null;
    }

    if (errors?.length === 1) {
      return errors[0]?.message;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {/* biome-ignore lint/suspicious/noArrayIndexKey: error messages are stable and order is maintained */}
        {errors.map((error, index) => error?.message && <li key={index}>{error.message}</li>)}
      </ul>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <div
      className={cn('font-normal text-destructive text-sm', className)}
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
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
