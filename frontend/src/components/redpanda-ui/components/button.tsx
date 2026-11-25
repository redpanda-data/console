'use client';

// Copyright 2026 Redpanda Data, Inc.

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import type { VariantProps } from 'class-variance-authority';
import type React from 'react';
import type { ElementType } from 'react';
import { Spinner } from './spinner';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';
import { buttonVariants } from './button/variants';

export type ButtonVariants = VariantProps<typeof buttonVariants>;

/** Base UI can't introspect a component `render`, so force `false` only for a known non-button
 * intrinsic and otherwise defer to it. */
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
      typeof render === 'object' && 'type' in render && typeof render.type === 'string' && render.type !== 'button';
    return isNonButtonIntrinsic ? false : undefined;
  }
  if (as !== undefined) {
    return as === 'button' ? undefined : false;
  }
  return undefined;
}

function renderButtonChildren(children: React.ReactNode, icon: React.ReactNode, isLoading: boolean): React.ReactNode {
  const content = hasSlotContent(icon) ? (
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
      <span className="inline-flex items-center justify-center [gap:inherit] opacity-0">{content}</span>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
        <Spinner />
      </span>
    </>
  );
}

export type ButtonProps = ButtonPrimitive.Props &
  ButtonVariants & {
    /** Render the button as a different element (e.g. a router `Link` or `"a"`). */
    as?: ElementType | undefined;
    /** Router destination, forwarded to the element rendered via `as`. */
    to?: string | undefined;
    href?: string | undefined;
    target?: string | undefined;
    rel?: string | undefined;
    icon?: React.ReactNode | undefined;
    /** Centered spinner overlay at the button's natural width; also disables interaction and sets aria-busy. */
    isLoading?: boolean | undefined;
  } & SharedProps;

function Button({
  className,
  variant,
  size,
  weight,
  shape,
  testId,
  as,
  to,
  href,
  icon,
  isLoading = false,
  disabled,
  focusableWhenDisabled = false,
  render,
  nativeButton,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled === true ? disabled : isLoading;
  const renderedChildren = renderButtonChildren(children, icon, isLoading);

  // `as`/`to`/`href` map onto Base UI's `render`: anchors take `href`, router links take `to`.
  const AsElement = as;
  const asElementProps = AsElement === 'a' ? { href: href ?? to } : { to };
  const resolvedRender = render ?? (AsElement === undefined ? undefined : <AsElement {...asElementProps} />);

  const resolvedNativeButton = resolveNativeButton(nativeButton, render, as);
  const resolvedClassName =
    variant === 'unstyled'
      ? cn('outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)
      : cn(
          'rounded-md',
          buttonVariants({ variant, size, weight, shape }),
          hasSlotContent(icon) && 'gap-2',
          isLoading && 'relative',
          className
        );

  return (
    <ButtonPrimitive
      aria-busy={isLoading || undefined}
      className={resolvedClassName}
      data-focusable={focusableWhenDisabled || undefined}
      data-loading={isLoading || undefined}
      data-slot="button"
      data-testid={testId}
      disabled={isDisabled}
      focusableWhenDisabled={focusableWhenDisabled}
      nativeButton={resolvedNativeButton}
      render={resolvedRender}
      {...props}
    >
      {renderedChildren}
    </ButtonPrimitive>
  );
}

type ButtonLinkAppearance = {
  [Key in keyof ButtonVariants]: NonNullable<ButtonVariants[Key]> | undefined;
};

export type ButtonLinkProps = React.ComponentProps<'a'> &
  Omit<ButtonLinkAppearance, 'variant'> &
  SharedProps & {
    href: string;
    variant?: Exclude<NonNullable<ButtonVariants['variant']>, 'unstyled'> | undefined;
  };

/** Button appearance with native navigation semantics, including Enter and modifier activation. */
function ButtonLink({ className, variant, size, weight, shape, testId, ...props }: ButtonLinkProps) {
  return (
    <a
      {...props}
      className={cn('rounded-md', buttonVariants({ variant, size, weight, shape }), className)}
      data-slot="button-link"
      data-testid={testId}
    />
  );
}

export { Button, ButtonLink };
