'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type React from 'react';
import type { ElementType } from 'react';

import { groupItemClasses, useGroup } from './group';
import { Spinner } from './spinner';
import { cn, type SharedProps } from '../lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'whitespace-nowrap font-semibold transition-all motion-reduce:transition-none',
    'cursor-pointer',
    'disabled:pointer-events-none disabled:cursor-not-allowed data-disabled:pointer-events-none data-disabled:cursor-not-allowed',
    'shrink-0 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    // `!` to outrank the outline variants' `!important` rest border.
    'focus-visible:!border-ring outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    'aria-invalid:!border-destructive aria-invalid:ring-invalid',
    'selection:bg-selection selection:text-selection-foreground',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        // Named after its family like `outline`/`ghost`/`dashed`, not after the `--color-secondary`
        // it paints: an unstyled control should not have to name a tone.
        default: [
          'bg-secondary text-secondary-foreground shadow-xs',
          'hover:bg-secondary-hover',
          'active:bg-secondary-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled',
        ],
        primary: [
          'bg-primary text-primary-foreground shadow-xs',
          'hover:bg-primary-hover',
          'active:bg-primary-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled',
        ],
        brand: [
          'bg-brand text-brand-foreground shadow-xs',
          'hover:bg-brand-hover',
          'active:bg-brand-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled',
        ],
        warning: [
          'bg-surface-warning text-warning-foreground shadow-xs',
          'hover:bg-surface-warning-hover',
          'active:bg-surface-warning-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled',
        ],
        destructive: [
          'bg-surface-destructive text-destructive-foreground shadow-xs',
          'hover:bg-surface-destructive-hover',
          'active:bg-surface-destructive-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:bg-surface-disabled disabled:text-disabled',
        ],
        // Both sides flip, so it stays light on a dark ground and dark on a light one.
        inverse: [
          'bg-inverse text-strong shadow-xs',
          'hover:bg-inverse-hover',
          'active:bg-inverse-pressed',
          'disabled:bg-surface-disabled disabled:text-disabled',
        ],
        // Outline, ghost and dashed repeat the filled tones with a border, no border, and a dashed
        // one. Each state steps the ramp its own rest token sits on, so a line moves one rung rather
        // than jumping family.
        outline: [
          '!border-secondary-line border bg-transparent text-secondary shadow-xs',
          'hover:!border-secondary-line-hover hover:bg-secondary-wash',
          'active:!border-secondary-line-pressed active:bg-secondary-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'primary-outline': [
          '!border-primary-line border bg-transparent text-primary shadow-xs',
          'hover:!border-primary-line-hover hover:bg-primary-wash',
          'active:!border-primary-line-pressed active:bg-primary-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'brand-outline': [
          '!border-brand-line border bg-transparent text-brand shadow-xs',
          'hover:!border-brand-line-hover hover:bg-brand-wash',
          'active:!border-brand-line-pressed active:bg-brand-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'warning-outline': [
          '!border-warning-line border bg-transparent text-warning shadow-xs',
          'hover:!border-warning-line-hover hover:bg-warning-wash',
          'active:!border-warning-line-pressed active:bg-warning-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'destructive-outline': [
          '!border-destructive-line border bg-transparent text-destructive shadow-xs',
          'hover:!border-destructive-line-hover hover:bg-destructive-wash',
          'active:!border-destructive-line-pressed active:bg-destructive-wash-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:!border-border disabled:text-disabled',
        ],
        // Takes the ground's own ink, for a fill this variant cannot know. Alpha, not a `-subtle`
        // token, so the wash steps off that inherited ink.
        'current-outline': [
          '!border-current border bg-transparent text-current shadow-xs',
          'hover:bg-current/15',
          'active:bg-current/25',
          'disabled:!border-border disabled:text-disabled',
        ],
        ghost: [
          'bg-transparent text-secondary',
          'hover:bg-secondary-wash',
          'active:bg-secondary-wash-pressed',
          'disabled:text-disabled',
        ],
        'primary-ghost': [
          'bg-transparent text-primary',
          'hover:bg-primary-wash',
          'active:bg-primary-wash-pressed',
          'disabled:text-disabled',
        ],
        'brand-ghost': [
          'bg-transparent text-brand',
          'hover:bg-brand-wash',
          'active:bg-brand-wash-pressed',
          'disabled:text-disabled',
        ],
        'warning-ghost': [
          'bg-transparent text-warning',
          'hover:bg-warning-wash',
          'active:bg-warning-wash-pressed',
          'disabled:text-disabled',
        ],
        'destructive-ghost': [
          'bg-transparent text-destructive',
          'hover:bg-destructive-wash',
          'active:bg-destructive-wash-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:text-disabled',
        ],
        'current-ghost': [
          'bg-transparent text-current',
          'hover:bg-current/15',
          'active:bg-current/25',
          'disabled:text-disabled',
        ],
        // Unshadowed, unlike `outline`: a placeholder should not sit proud of its ground.
        dashed: [
          '!border-secondary-line border border-dashed bg-transparent text-secondary',
          'hover:!border-secondary-line-hover hover:bg-secondary-wash',
          'active:!border-secondary-line-pressed active:bg-secondary-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'primary-dashed': [
          '!border-primary-line border border-dashed bg-transparent text-primary',
          'hover:!border-primary-line-hover hover:bg-primary-wash',
          'active:!border-primary-line-pressed active:bg-primary-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'brand-dashed': [
          '!border-brand-line border border-dashed bg-transparent text-brand',
          'hover:!border-brand-line-hover hover:bg-brand-wash',
          'active:!border-brand-line-pressed active:bg-brand-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'warning-dashed': [
          '!border-warning-line border border-dashed bg-transparent text-warning',
          'hover:!border-warning-line-hover hover:bg-warning-wash',
          'active:!border-warning-line-pressed active:bg-warning-wash-pressed',
          'disabled:!border-border disabled:text-disabled',
        ],
        'destructive-dashed': [
          '!border-destructive-line border border-dashed bg-transparent text-destructive',
          'hover:!border-destructive-line-hover hover:bg-destructive-wash',
          'active:!border-destructive-line-pressed active:bg-destructive-wash-pressed',
          'focus-visible:ring-destructive/50',
          'disabled:!border-border disabled:text-disabled',
        ],
        'current-dashed': [
          '!border-current border border-dashed bg-transparent text-current',
          'hover:bg-current/15',
          'active:bg-current/25',
          'disabled:!border-border disabled:text-disabled',
        ],
        link: [
          'link-standalone text-action-primary',
          'hover:text-action-primary-hover',
          'active:text-action-primary-pressed',
          'disabled:text-disabled disabled:no-underline',
        ],
      },
      size: {
        xs: 'h-6 gap-1 px-2 py-0 text-body-sm has-[>svg]:px-1.5 [&_svg]:size-3',
        sm: 'h-8 gap-2 px-3 py-0 text-body-sm has-[>svg]:px-2.5 [&_svg]:size-3.5',
        md: 'h-9 gap-2 px-4 py-0 text-body has-[>svg]:px-3 [&_svg]:size-4',
        lg: 'h-10 gap-2 px-6 py-0 text-body-lg has-[>svg]:px-4 [&_svg]:size-5',
        icon: 'size-9 [&_svg]:size-5',
        'icon-xs': 'size-6 [&_svg]:size-3.5',
        'icon-sm': 'size-8 [&_svg]:size-4',
        'icon-lg': 'size-10 [&_svg]:size-6',
      },
    },
    defaultVariants: {
      // Neutral, not the action colour: an unstyled <Button> should not claim the page's one loud
      // slot. `primary` is opt-in. This is also why the swap left plain <Button> looking unchanged.
      variant: 'default',
      size: 'md',
    },
  }
);

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
  const positionClasses = groupItemClasses(attached, position);
  const isDisabled = disabled || isLoading;
  const renderedChildren = renderButtonChildren(children, icon, isLoading);

  // `as`/`to`/`href` map onto Base UI's `render`: anchors take `href`, router links take `to`.
  const AsElement = as;
  const asElementProps = AsElement === 'a' ? { href: href ?? to } : { to };
  const resolvedRender = render ?? (AsElement ? <AsElement {...asElementProps} /> : undefined);

  const resolvedNativeButton = resolveNativeButton(nativeButton, render, as);

  return (
    <ButtonPrimitive
      aria-busy={isLoading || undefined}
      // `className` last: `positionClasses` sets a radius a caller's own `rounded-*` has to win.
      className={cn(
        buttonVariants({ variant, size }),
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
