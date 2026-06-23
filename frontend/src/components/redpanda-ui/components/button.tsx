'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import type { ElementType } from 'react';

import { useGroup } from './group';
import { Spinner } from './spinner';
import { cn, type SharedProps } from '../lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'whitespace-nowrap font-semibold transition-all',
    'cursor-pointer',
    'disabled:pointer-events-none disabled:cursor-not-allowed data-disabled:pointer-events-none data-disabled:cursor-not-allowed',
    'shrink-0 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
    'selection:bg-selected selection:text-selected-foreground',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-surface-secondary text-inverse shadow-xs',
          'hover:bg-surface-secondary-hover',
          'active:bg-surface-secondary-pressed',
          'disabled:bg-background-disabled disabled:text-disabled',
          undefined,
        ],
        secondary: [
          'bg-surface-primary text-inverse shadow-xs',
          'hover:bg-surface-primary-hover',
          'active:bg-surface-primary-pressed',
          'disabled:bg-background-disabled disabled:text-disabled',
        ],
        accent: [
          'bg-brand text-inverse shadow-xs',
          'hover:bg-surface-brand-hover',
          'active:bg-surface-brand-pressed',
          'disabled:bg-background-disabled disabled:text-disabled',
        ],
        destructive: [
          'bg-surface-error text-inverse shadow-xs',
          'hover:bg-surface-error-hover',
          'active:bg-surface-error-pressed',
          'focus-visible:ring-destructive',
          'disabled:bg-background-disabled disabled:text-disabled',
        ],
        inverse: [
          'bg-surface-inverse text-secondary shadow-xs',
          'hover:bg-surface-inverse-hover',
          'active:bg-surface-inverse-pressed',
          'disabled:bg-surface-inverse-disabled disabled:text-disabled',
        ],
        outline: [
          '!border-outline-primary border text-primary-inverse shadow-xs',
          'hover:border-outline-primary-hover hover:bg-primary-alpha-subtle',
          'active:border-outline-primary-pressed active:bg-primary-alpha-subtle-default',
          'disabled:border-outline-inverse-disabled disabled:text-disabled',
        ],
        'secondary-outline': [
          '!border-outline-inverse border text-secondary shadow-xs',
          'hover:border-outline-hover hover:bg-secondary-alpha-subtle',
          'active:border-outline-pressed active:bg-secondary-alpha-default',
          'disabled:border-outline-inverse-disabled disabled:text-disabled',
        ],
        'accent-outline': [
          '!border-brand border bg-transparent text-brand shadow-xs',
          'hover:border-outline-brand-hover hover:bg-brand-alpha-subtle',
          'active:border-outline-brand-pressed active:bg-brand-alpha-default',
          'disabled:border-border disabled:text-disabled',
        ],
        'destructive-outline': [
          '!border-destructive border bg-transparent text-destructive shadow-xs',
          'hover:border-outline-error-hover hover:bg-destructive-alpha-subtle',
          'active:border-outline-error-pressed active:bg-destructive-alpha-default',
          'focus-visible:ring-destructive',
          'disabled:border-border disabled:text-disabled',
        ],
        'inverse-outline': [
          '!border-inverse-primary border bg-transparent text-inverse-primary shadow-xs',
          'hover:border-transparent hover:bg-light-alpha-strong',
          'active:border-transparent active:bg-light-alpha-stronger',
          'disabled:border-inverse-disabled disabled:text-inverse-disabled',
        ],
        ghost: [
          'bg-transparent text-action-primary',
          'hover:bg-surface-primary-subtle',
          'active:bg-surface-primary-subtle-hover',
          'disabled:text-disabled',
        ],
        'secondary-ghost': [
          'bg-transparent text-secondary',
          'hover:bg-surface-secondary-subtle',
          'active:bg-surface-secondary-subtle-hover',
          'disabled:text-disabled',
        ],
        'accent-ghost': [
          'bg-transparent text-brand',
          'hover:bg-surface-brand-subtle hover:text-brand',
          'active:bg-surface-brand-subtle-hover',
          'disabled:text-disabled',
        ],
        'destructive-ghost': [
          'bg-transparent text-destructive',
          'hover:bg-background-error-subtle hover:text-destructive',
          'active:bg-destructive-subtle',
          'focus-visible:ring-destructive',
          'disabled:text-disabled',
        ],
        'inverse-ghost': [
          'bg-transparent text-inverse-primary',
          'hover:bg-light-alpha-strong',
          'active:bg-light-alpha-stronger',
          'disabled:text-inverse-disabled',
        ],
        link: [
          'text-primary underline-offset-4',
          'hover:text-primary/80 hover:underline',
          'active:text-primary/60',
          'disabled:text-disabled disabled:no-underline',
        ],
        dashed: [
          '!border-primary border-2 border-dashed bg-transparent text-primary',
          'hover:border-primary/80 hover:bg-primary/5',
          'active:bg-primary/10',
          'disabled:border-border disabled:text-disabled',
        ],
      },
      size: {
        xs: 'h-6 gap-1 px-2 py-0 text-xs has-[>svg]:px-1.5 [&_svg]:size-3',
        sm: 'h-8 gap-2 px-3 py-0 text-xs has-[>svg]:px-2.5 [&_svg]:size-3.5',
        md: 'h-10 gap-2 px-4 py-0 text-sm has-[>svg]:px-3 [&_svg]:size-4',
        lg: 'h-12 gap-2 px-6 py-0 text-base has-[>svg]:px-4 [&_svg]:size-5',
        icon: 'size-10 [&_svg]:size-5',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
        'icon-sm': 'size-8 [&_svg]:size-4',
        'icon-lg': 'size-12 [&_svg]:size-6',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

/**
 * Resolve Base UI's `nativeButton` flag. Base UI can't introspect a component render,
 * so force `false` only for a known non-button intrinsic `render`/`as`; else defer to it.
 */
function resolveNativeButton(
  explicit: boolean | undefined,
  render: ButtonPrimitive.Props['render'],
  as: ElementType | undefined
): boolean | undefined {
  if (explicit !== undefined) {
    return explicit;
  }
  if (render !== undefined) {
    const isNonButtonIntrinsic =
      typeof render === 'object' &&
      render !== null &&
      'type' in render &&
      typeof render.type === 'string' &&
      render.type !== 'button';
    return isNonButtonIntrinsic ? false : undefined;
  }
  if (as !== undefined) {
    return as === 'button' ? undefined : false;
  }
  return;
}

type GroupPosition = 'first' | 'middle' | 'last' | undefined;

function getPositionClasses(attached: boolean, position: GroupPosition): string {
  if (!attached) {
    return 'rounded-md';
  }
  if (position === 'first') {
    return 'rounded-r-none rounded-l-md border-r-0';
  }
  if (position === 'last') {
    return 'rounded-r-md rounded-l-none border-l-0';
  }
  if (position === 'middle') {
    return 'rounded-none border-r-0 border-l-0';
  }
  return 'rounded-md';
}

function renderButtonChildren(children: React.ReactNode, icon: React.ReactNode, isLoading: boolean): React.ReactNode {
  const content = icon ? (
    <>
      {children}
      {icon}
    </>
  ) : (
    children
  );

  if (!isLoading) {
    return content;
  }

  return (
    <>
      <span className="invisible inline-flex items-center justify-center [gap:inherit]">{content}</span>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <Spinner />
      </span>
    </>
  );
}

export type ButtonProps = ButtonPrimitive.Props &
  ButtonVariants & {
    /** Render the button as a different element (e.g. a router `Link` or `"a"`). */
    as?: ElementType;
    /** Router destination, forwarded to the element rendered via `as`. */
    to?: string;
    href?: string;
    target?: string;
    rel?: string;
    icon?: React.ReactNode;
    /** Centered spinner overlay at the button's natural width; also disables interaction and sets aria-busy. */
    isLoading?: boolean;
  } & SharedProps;

function Button({
  className,
  variant,
  size,
  testId,
  as,
  to,
  href,
  icon,
  isLoading = false,
  disabled,
  render,
  nativeButton,
  children,
  ...props
}: ButtonProps) {
  const { attached, position } = useGroup();
  const positionClasses = getPositionClasses(attached, position);
  const isDisabled = disabled || isLoading;
  const renderedChildren = renderButtonChildren(children, icon, isLoading);

  // `as`/`to`/`href` are router value-adds mapped onto Base UI's native `render` prop.
  // Anchors (`as="a"`) take `href`; router links (`as={Link}`) take `to`.
  const AsElement = as;
  const asElementProps = AsElement === 'a' ? { href: href ?? to } : { to };
  const resolvedRender = render ?? (AsElement ? <AsElement {...asElementProps} /> : undefined);

  const resolvedNativeButton = resolveNativeButton(nativeButton, render, as);

  return (
    <ButtonPrimitive
      aria-busy={isLoading || undefined}
      className={cn(
        buttonVariants({ variant, size, className }),
        positionClasses,
        icon && 'gap-2',
        isLoading && 'relative',
        className
      )}
      data-loading={isLoading || undefined}
      data-slot="button"
      data-testid={testId}
      disabled={isDisabled}
      nativeButton={resolvedNativeButton}
      render={resolvedRender}
      {...props}
    >
      {renderedChildren}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
