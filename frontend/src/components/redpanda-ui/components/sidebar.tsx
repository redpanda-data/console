'use client';

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { mergeProps } from '@base-ui/react/merge-props';
import { Separator as SeparatorPrimitive } from '@base-ui/react/separator';
import { useRender } from '@base-ui/react/use-render';
import { PanelLeftIcon } from 'lucide-react';
import type { Transition } from 'motion/react';
import type React from 'react';
import { Button } from './button';
import { Input } from './input';
import { MotionHighlight } from './motion-highlight';
import { cn, type SharedProps } from '../lib/utils';

import { MobileSidebar } from './sidebar/mobile-sidebar';
import { useSidebar } from './sidebar/sidebar-context';

type SidebarProps = React.ComponentProps<'div'> & {
  side?: 'left' | 'right' | undefined;
  variant?: 'sidebar' | 'floating' | 'inset' | undefined;
  collapsible?: 'offcanvas' | 'icon' | 'none' | undefined;
  containerClassName?: string | undefined;
  animateOnHover?: boolean | undefined;
  transition?: Transition | undefined;
};

const DEFAULT_TRANSITION: Transition = { type: 'spring', stiffness: 350, damping: 35 };

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  dir,
  animateOnHover = true,
  containerClassName,
  transition = DEFAULT_TRANSITION,
  ...props
}: SidebarProps) {
  const { isMobile, state } = useSidebar();

  if (collapsible === 'none') {
    return (
      <MotionHighlight
        containerClassName={containerClassName}
        enabled={animateOnHover}
        hover
        mode="parent"
        transition={transition}
        variant="navigation"
      >
        <div
          className={cn('flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground', className)}
          data-slot="sidebar"
          {...props}
        >
          {children}
        </div>
      </MotionHighlight>
    );
  }

  if (isMobile) {
    return (
      <MobileSidebar className={className} dir={dir} side={side} {...props}>
        <MotionHighlight
          containerClassName={cn('h-full', containerClassName)}
          enabled={animateOnHover}
          hover
          mode="parent"
          transition={transition}
          variant="navigation"
        >
          <div className="flex size-full flex-col">{children}</div>
        </MotionHighlight>
      </MobileSidebar>
    );
  }

  return (
    <div
      className="group peer text-sidebar-foreground max-md:hidden"
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      <div
        className={cn(
          'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear motion-reduce:transition-none',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
        )}
        data-slot="sidebar-gap"
      />
      <div
        className={cn(
          'fixed inset-y-0 z-10 flex h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear motion-reduce:transition-none max-md:hidden',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
          className
        )}
        data-slot="sidebar-container"
        {...props}
      >
        <MotionHighlight
          containerClassName={cn('size-full', containerClassName)}
          enabled={animateOnHover}
          forceUpdateBounds
          hover
          mode="parent"
          transition={transition}
          variant="navigation"
        >
          <div
            className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
            data-sidebar="sidebar"
            data-slot="sidebar-inner"
          >
            {children}
          </div>
        </MotionHighlight>
      </div>
    </div>
  );
}

type SidebarTriggerProps = React.ComponentProps<typeof Button>;

function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      className={cn('size-7', className)}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon"
      variant="ghost"
      {...props}
    >
      <PanelLeftIcon className="rtl:rotate-180" />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

type SidebarRailProps = React.ComponentProps<'button'>;

function SidebarRail({ className, ...props }: SidebarRailProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <ButtonPrimitive
      aria-label="Toggle Sidebar"
      className={cn(
        'absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:inset-s-1/2 after:w-[2px] hover:after:bg-sidebar-border motion-reduce:transition-none sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        className
      )}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={toggleSidebar}
      tabIndex={-1}
      title="Toggle Sidebar"
      type="button"
      {...props}
    />
  );
}

type SidebarInsetProps = React.ComponentProps<'main'>;

function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <main
      className={cn(
        // min-w-0 lets wide content scroll its own container instead of the document
        'relative flex w-full min-w-0 flex-1 flex-col bg-background',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        className
      )}
      data-slot="sidebar-inset"
      {...props}
    />
  );
}

type SidebarInputProps = React.ComponentProps<typeof Input>;

function SidebarInput({ className, ...props }: SidebarInputProps) {
  return (
    <Input
      appearance="surface-flat"
      className={cn('w-full', className)}
      data-sidebar="input"
      data-slot="sidebar-input"
      size="sm"
      {...props}
    />
  );
}

type SidebarHeaderProps = React.ComponentProps<'div'>;

function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-2 p-2', className)}
      data-sidebar="header"
      data-slot="sidebar-header"
      {...props}
    />
  );
}

type SidebarFooterProps = React.ComponentProps<'div'>;

function SidebarFooter({ className, ...props }: SidebarFooterProps) {
  return (
    <div
      className={cn('flex flex-col gap-2 p-2', className)}
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...props}
    />
  );
}

type SidebarSeparatorProps = React.ComponentProps<typeof SeparatorPrimitive> &
  SharedProps & {
    decorative?: boolean | undefined;
  };

function SidebarSeparator({
  className,
  decorative = true,
  orientation = 'horizontal',
  testId,
  ...props
}: SidebarSeparatorProps) {
  return (
    <SeparatorPrimitive
      aria-hidden={decorative || undefined}
      className={cn(
        'mx-2 shrink-0 bg-sidebar-border',
        orientation === 'horizontal' ? 'h-px w-auto' : 'w-px self-stretch',
        className
      )}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      data-testid={testId}
      orientation={orientation}
      role={decorative ? 'none' : 'separator'}
      {...props}
    />
  );
}

type SidebarContentProps = React.ComponentProps<'div'>;

function SidebarContent({ className, ...props }: SidebarContentProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        className
      )}
      data-sidebar="content"
      data-slot="sidebar-content"
      {...props}
    />
  );
}

type SidebarGroupProps = React.ComponentProps<'div'>;

function SidebarGroup({ className, ...props }: SidebarGroupProps) {
  return (
    <div
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      data-sidebar="group"
      data-slot="sidebar-group"
      {...props}
    />
  );
}

type SidebarGroupLabelProps = useRender.ComponentProps<'div'>;

function SidebarGroupLabel({ className, render, ...props }: SidebarGroupLabelProps) {
  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(
      {
        className: cn(
          'flex h-8 shrink-0 items-center rounded-md px-2 text-body-sm font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-300 ease-linear focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0',
          'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
          className
        ),
      },
      props
    ),
    state: {
      slot: 'sidebar-group-label',
      sidebar: 'group-label',
    },
  });
}

type SidebarGroupActionProps = useRender.ComponentProps<'button'>;

function SidebarGroupAction({ className, render, ...props }: SidebarGroupActionProps) {
  return useRender({
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(
      {
        className: cn(
          'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 focus-visible:ring-sidebar-ring/50 active:bg-sidebar-accent-pressed motion-reduce:transition-none [&>svg]:size-4 [&>svg]:shrink-0',
          // Increases the hit area of the button on mobile.
          'after:absolute after:-inset-2 md:after:hidden',
          'group-data-[collapsible=icon]:hidden',
          className
        ),
      },
      props
    ),
    state: {
      slot: 'sidebar-group-action',
      sidebar: 'group-action',
    },
  });
}

type SidebarGroupContentProps = React.ComponentProps<'div'>;

function SidebarGroupContent({ className, ...props }: SidebarGroupContentProps) {
  return (
    <div
      className={cn('w-full text-body', className)}
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...props}
    />
  );
}

export {
  SidebarProvider,
  type SidebarProviderProps,
  useSidebar,
} from './sidebar/sidebar-context';
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
} from './sidebar/sidebar-menu';
export {
  Sidebar,
  SidebarContent,
  type SidebarContentProps,
  SidebarFooter,
  type SidebarFooterProps,
  SidebarGroup,
  SidebarGroupAction,
  type SidebarGroupActionProps,
  SidebarGroupContent,
  type SidebarGroupContentProps,
  SidebarGroupLabel,
  type SidebarGroupLabelProps,
  type SidebarGroupProps,
  SidebarHeader,
  type SidebarHeaderProps,
  SidebarInput,
  type SidebarInputProps,
  SidebarInset,
  type SidebarInsetProps,
  type SidebarProps,
  SidebarRail,
  type SidebarRailProps,
  SidebarSeparator,
  type SidebarSeparatorProps,
  SidebarTrigger,
  type SidebarTriggerProps,
};
