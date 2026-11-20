'use client';

import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';
import React from 'react';
import { MotionHighlightItem, useMotionHighlight } from '../motion-highlight';
import { Skeleton } from '../skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, useTooltipProviderDepth } from '../tooltip';
import { cn } from '../../lib/utils';
import { useSidebar } from './sidebar-context';

type SidebarMenuProps = React.ComponentProps<'ul'>;

function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return (
    <ul
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      data-sidebar="menu"
      data-slot="sidebar-menu"
      {...props}
    />
  );
}

type SidebarMenuItemProps = React.ComponentProps<'li'>;

function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps) {
  return (
    <li
      className={cn('group/menu-item relative', className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md p-2 text-left text-body ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 active:bg-sidebar-accent-pressed active:text-sidebar-accent-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground motion-reduce:transition-none [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: '',
        outline: 'bg-background shadow-[0_0_0_1px_var(--color-sidebar-border)]',
      },
      size: {
        sm: 'h-7 text-body-sm',
        md: 'h-8 text-body',
        lg: 'h-12 text-body group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

// Instant hover — applied only when the animated highlight is off, to avoid doubling.
const sidebarMenuButtonHoverVariants = cva('hover:bg-sidebar-accent hover:text-sidebar-accent-foreground', {
  variants: {
    variant: {
      default: '',
      outline: 'hover:shadow-[0_0_0_1px_var(--color-sidebar-accent)]',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type SidebarNativeRenderProps<Tag extends 'a' | 'button'> = Omit<useRender.ComponentProps<Tag>, 'disabled' | 'render'> &
  (
    | { disabled?: boolean | undefined; render?: undefined }
    | { disabled?: false | undefined; render?: useRender.ComponentProps<Tag>['render'] }
  );

type SidebarMenuAppearance = VariantProps<typeof sidebarMenuButtonVariants> & {
  isActive?: boolean | undefined;
  tooltip?: string | React.ComponentProps<typeof TooltipContent> | undefined;
};

type SidebarMenuButtonProps = SidebarNativeRenderProps<'button'> & SidebarMenuAppearance;
type SidebarNativeLinkProps = Omit<React.ComponentProps<'a'>, 'href'> &
  (
    | { href: string; disabled?: boolean | undefined; render?: undefined }
    | {
        href?: string | undefined;
        disabled?: false | undefined;
        render: NonNullable<useRender.ComponentProps<'a'>['render']>;
      }
  );
type SidebarMenuLinkProps = SidebarNativeLinkProps & SidebarMenuAppearance;

function requireOwnedDisabledElement(disabled: boolean, render: useRender.RenderProp | undefined): void {
  if (disabled && render !== undefined) {
    throw new Error('Disabled sidebar controls must use their owned native element; omit render.');
  }
}

function preventDisabledActivation(event: React.SyntheticEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function disabledLinkProps(disabled: boolean): React.ComponentProps<'a'> {
  if (!disabled) {
    return {};
  }
  return {
    'aria-disabled': true,
    href: undefined,
    role: 'link',
    tabIndex: -1,
    onClick: preventDisabledActivation,
    onClickCapture: preventDisabledActivation,
    onAuxClick: preventDisabledActivation,
    onAuxClickCapture: preventDisabledActivation,
    onPointerDown: preventDisabledActivation,
    onKeyDown(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        preventDisabledActivation(event);
      }
    },
  };
}

function useSidebarMenuMainClassName({
  variant,
  size,
  isActive,
  className,
}: Pick<SidebarMenuButtonProps, 'variant' | 'size' | 'isActive' | 'className'>): string {
  const { enabled: animateOnHover } = useMotionHighlight();
  return cn(
    sidebarMenuButtonVariants({ variant, size }),
    isActive === true && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
    animateOnHover !== true && sidebarMenuButtonHoverVariants({ variant }),
    className
  );
}

interface SidebarMenuFeedbackProps {
  disabled: boolean;
  element: React.ReactElement;
  isActive?: boolean | undefined;
  size?: string | null | undefined;
  sub?: boolean | undefined;
  tooltip: SidebarMenuAppearance['tooltip'];
  variant?: SidebarMenuAppearance['variant'];
}

function SidebarMenuFeedback({
  element,
  disabled,
  tooltip,
  isActive,
  size,
  variant,
  sub = false,
}: SidebarMenuFeedbackProps) {
  const { isMobile, state, tooltipProviderDepth } = useSidebar();
  const hasNestedTooltipProvider = useTooltipProviderDepth() > tooltipProviderDepth;
  const hasTooltip = tooltip !== undefined && tooltip !== '';
  const control = (
    <MotionHighlightItem
      className={sub ? undefined : 'peer/menu-button'}
      data-active={isActive === true || undefined}
      data-size={size}
      disabled={disabled}
      render={
        hasTooltip ? <TooltipTrigger delay={hasNestedTooltipProvider ? undefined : 0} render={element} /> : element
      }
      variant={variant === 'outline' ? 'navigation-outline' : 'navigation'}
    />
  );
  if (!hasTooltip) {
    return control;
  }
  const tooltipProps = typeof tooltip === 'string' ? { children: tooltip } : tooltip;
  const contentProps: React.ComponentProps<typeof TooltipContent> = {
    align: 'center',
    hidden: sub ? !disabled : (state !== 'collapsed' && !disabled) || isMobile,
    side: 'right',
    ...tooltipProps,
  };
  return (
    <Tooltip disabled={contentProps.hidden ?? false}>
      {control}
      <TooltipContent {...contentProps} />
    </Tooltip>
  );
}

function SidebarMenuButton({
  render,
  disabled = false,
  isActive = false,
  variant = 'default',
  size = 'md',
  tooltip,
  className,
  ...props
}: SidebarMenuButtonProps) {
  requireOwnedDisabledElement(disabled, render);
  const buttonClassName = useSidebarMenuMainClassName({ variant, size, isActive, className });
  const element = useRender({
    defaultTagName: 'button',
    render,
    props: { ...props, className: buttonClassName, disabled, ...(isActive && { 'data-active': 'true' }) },
    state: { slot: 'sidebar-menu-button', sidebar: 'menu-button', size },
  });
  return (
    <SidebarMenuFeedback
      disabled={disabled}
      element={element}
      isActive={isActive}
      size={size}
      tooltip={tooltip}
      variant={variant}
    />
  );
}

function SidebarMenuLink({
  render,
  disabled = false,
  isActive = false,
  variant = 'default',
  size = 'md',
  tooltip,
  className,
  ...props
}: SidebarMenuLinkProps) {
  requireOwnedDisabledElement(disabled, render);
  const linkClassName = useSidebarMenuMainClassName({ variant, size, isActive, className });
  const element = useRender({
    defaultTagName: 'a',
    render,
    props: {
      ...props,
      className: linkClassName,
      ...(isActive && { 'data-active': 'true' }),
      ...disabledLinkProps(disabled),
    },
    state: { slot: 'sidebar-menu-link', sidebar: 'menu-button', size },
  });
  return (
    <SidebarMenuFeedback
      disabled={disabled}
      element={element}
      isActive={isActive}
      size={size}
      tooltip={tooltip}
      variant={variant}
    />
  );
}

type SidebarMenuActionProps = useRender.ComponentProps<'button'> & {
  showOnHover?: boolean | undefined;
};

function SidebarMenuAction({ className, render, showOnHover = false, ...props }: SidebarMenuActionProps) {
  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(
      {
        className: cn(
          // Increases the hit area of the button on mobile.
          'absolute top-1.5 right-1 z-[1] flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 active:bg-sidebar-accent-pressed motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0',
          'after:absolute after:-inset-2 md:after:hidden',
          'peer-data-[size=sm]/menu-button:top-1',
          'peer-data-[size=default]/menu-button:top-1.5',
          'peer-data-[size=lg]/menu-button:top-2.5',
          'group-data-[collapsible=icon]:hidden',
          showOnHover &&
            'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[popup-open]:opacity-100 md:opacity-0',
          className
        ),
      },
      props
    ),
    state: {
      slot: 'sidebar-menu-action',
      sidebar: 'menu-action',
    },
  });
}

const sidebarMenuBadgeVariants = cva(
  [
    'pointer-events-none absolute right-1 flex items-center justify-center rounded-md font-medium tabular-nums select-none',
    'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
    'peer-data-[size=sm]/menu-button:top-1',
    'peer-data-[size=default]/menu-button:top-1.5',
    'peer-data-[size=lg]/menu-button:top-2.5',
    'group-data-[collapsible=icon]:hidden',
  ],
  {
    variants: {
      variant: {
        default: 'h-5 min-w-5 px-1 text-body-sm text-sidebar-foreground',
        secondary: 'h-4 bg-secondary px-1.5 text-2xs text-secondary-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type SidebarMenuBadgeProps = React.ComponentProps<'div'> & VariantProps<typeof sidebarMenuBadgeVariants>;

function SidebarMenuBadge({ className, variant, ...props }: SidebarMenuBadgeProps) {
  return (
    <div
      className={cn(sidebarMenuBadgeVariants({ variant }), className)}
      data-sidebar="menu-badge"
      data-slot="sidebar-menu-badge"
      {...props}
    />
  );
}

type SidebarMenuSkeletonProps = React.ComponentProps<'div'> & {
  showIcon?: boolean | undefined;
  /** When true, renders the text skeleton at full width instead of a random 50–90% width. */
  uniform?: boolean | undefined;
};

function skeletonWidth(id: string): string {
  let offset = 0;
  for (const character of id) {
    offset = (offset * 31 + character.charCodeAt(0)) % 40;
  }
  return `${offset + 50}%`;
}

function SidebarMenuSkeleton({ className, showIcon = false, uniform = false, ...props }: SidebarMenuSkeletonProps) {
  // useId survives hydration; drawing a fresh random width on the client does not.
  const width = skeletonWidth(React.useId());
  const skeletonStyle: React.CSSProperties & { '--skeleton-width': string } = { '--skeleton-width': width };

  return (
    <div
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
      data-sidebar="menu-skeleton"
      data-slot="sidebar-menu-skeleton"
      {...props}
    >
      {showIcon ? <Skeleton className="size-4 shrink-0" data-sidebar="menu-skeleton-icon" /> : null}
      <Skeleton
        className={cn('h-4 flex-1', uniform ? 'w-full' : 'max-w-(--skeleton-width)')}
        data-sidebar="menu-skeleton-text"
        style={uniform ? undefined : skeletonStyle}
      />
    </div>
  );
}

type SidebarMenuSubProps = React.ComponentProps<'ul'>;

function SidebarMenuSub({ className, ...props }: SidebarMenuSubProps) {
  return (
    <ul
      className={cn(
        'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
      data-sidebar="menu-sub"
      data-slot="sidebar-menu-sub"
      {...props}
    />
  );
}

type SidebarMenuSubItemProps = React.ComponentProps<'li'>;

function SidebarMenuSubItem({ className, ...props }: SidebarMenuSubItemProps) {
  return (
    <li
      className={cn('group/menu-sub-item relative', className)}
      data-sidebar="menu-sub-item"
      data-slot="sidebar-menu-sub-item"
      {...props}
    />
  );
}

type SidebarMenuSubLinkProps = SidebarNativeLinkProps & {
  size?: 'sm' | 'md' | undefined;
  isActive?: boolean | undefined;
  tooltip?: string | React.ComponentProps<typeof TooltipContent> | undefined;
};

function SidebarMenuSubLink({
  render,
  disabled = false,
  size = 'md',
  isActive = false,
  className,
  tooltip,
  ...props
}: SidebarMenuSubLinkProps) {
  requireOwnedDisabledElement(disabled, render);
  const { enabled: animateOnHover } = useMotionHighlight();
  const element = useRender({
    defaultTagName: 'a',
    render,
    props: {
      ...props,
      className: cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 active:bg-sidebar-accent-pressed active:text-sidebar-accent-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
        animateOnHover !== true && 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
        size === 'sm' && 'text-body-sm',
        size === 'md' && 'text-body',
        'group-data-[collapsible=icon]:hidden',
        className
      ),
      // Emit data-active only when active (see SidebarMenuButton).
      ...(isActive && { 'data-active': 'true' }),
      ...disabledLinkProps(disabled),
    },
    state: {
      slot: 'sidebar-menu-sub-link',
      sidebar: 'menu-sub-button',
      size,
    },
  });

  return <SidebarMenuFeedback disabled={disabled} element={element} sub tooltip={tooltip} />;
}

export {
  SidebarMenu,
  SidebarMenuAction,
  type SidebarMenuActionProps,
  SidebarMenuBadge,
  type SidebarMenuBadgeProps,
  SidebarMenuButton,
  type SidebarMenuButtonProps,
  SidebarMenuItem,
  type SidebarMenuItemProps,
  SidebarMenuLink,
  type SidebarMenuLinkProps,
  type SidebarMenuProps,
  SidebarMenuSkeleton,
  type SidebarMenuSkeletonProps,
  SidebarMenuSub,
  SidebarMenuSubItem,
  type SidebarMenuSubItemProps,
  SidebarMenuSubLink,
  type SidebarMenuSubLinkProps,
  type SidebarMenuSubProps,
};
