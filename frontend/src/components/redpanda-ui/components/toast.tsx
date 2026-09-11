'use client';

import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { AlertTriangle, CheckCircle, Info, Loader, X, XCircle } from 'lucide-react';
import type React from 'react';

import { Button } from './button';
import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type SharedProps } from '../lib/utils';

export interface ToastProviderProps extends ToastPrimitive.Provider.Props {}

export interface ToastPortalProps extends ToastPrimitive.Portal.Props, SharedProps {}

export interface ToastViewportProps extends ToastPrimitive.Viewport.Props, SharedProps {}

export interface ToastProps extends ToastPrimitive.Root.Props, SharedProps {}

export interface ToastContentProps extends ToastPrimitive.Content.Props, SharedProps {}

export interface ToastTitleProps extends ToastPrimitive.Title.Props, SharedProps {}

export interface ToastDescriptionProps extends ToastPrimitive.Description.Props, SharedProps {}

export interface ToastActionProps extends ToastPrimitive.Action.Props, SharedProps {}

export interface ToastCloseProps extends ToastPrimitive.Close.Props, SharedProps {}

const toast = ToastPrimitive.createToastManager();

function ToastProvider(props: ToastProviderProps) {
  return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ testId, ...props }: ToastPortalProps) {
  return <ToastPrimitive.Portal data-slot="toast-portal" data-testid={testId} {...props} />;
}

function ToastViewport({ className, testId, ...props }: ToastViewportProps) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full',
        className
      )}
      data-slot="toast-viewport"
      data-testid={testId}
      {...props}
    />
  );
}

function Toast({ className, testId, ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      className={cn(
        'group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom select-none rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none will-change-transform focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        '[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]',
        'h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]',
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
        'data-limited:opacity-0 data-starting-style:[transform:translateY(150%)]',
        '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]',
        'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
        'data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
        'data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
        'motion-reduce:transition-none',
        className
      )}
      data-slot="toast"
      data-testid={testId}
      {...props}
    />
  );
}

function ToastContent({ className, testId, ...props }: ToastContentProps) {
  return (
    <ToastPrimitive.Content
      className={cn(
        'flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100 motion-reduce:transition-none',
        className
      )}
      data-slot="toast-content"
      data-testid={testId}
      {...props}
    />
  );
}

function ToastTitle({ className, testId, ...props }: ToastTitleProps) {
  return (
    <ToastPrimitive.Title
      className={cn('font-medium text-body', className)}
      data-slot="toast-title"
      data-testid={testId}
      {...props}
    />
  );
}

function ToastDescription({ className, testId, ...props }: ToastDescriptionProps) {
  return (
    <ToastPrimitive.Description
      className={cn('text-body-sm text-subtle', className)}
      data-slot="toast-description"
      data-testid={testId}
      {...props}
    />
  );
}

function ToastAction({
  className,
  render = <Button size="sm" type="button" variant="outline" />,
  testId,
  ...props
}: ToastActionProps) {
  return (
    <ToastPrimitive.Action
      className={cn('shrink-0', className)}
      data-slot="toast-action"
      data-testid={testId}
      render={render}
      {...props}
    />
  );
}

function ToastClose({
  children,
  className,
  render = <Button size="icon-sm" type="button" variant="ghost" />,
  testId,
  ...props
}: ToastCloseProps) {
  return (
    <ToastPrimitive.Close
      aria-label="Close toast"
      className={cn(
        "relative shrink-0 text-subtle after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className
      )}
      data-slot="toast-close"
      data-testid={testId}
      render={render}
      {...props}
    >
      {children ?? <X aria-hidden="true" />}
    </ToastPrimitive.Close>
  );
}

function ToastIcon({ type }: { type: string | undefined }) {
  const iconByType: Record<string, React.ReactNode> = {
    success: <CheckCircle aria-hidden="true" className="text-success" />,
    info: <Info aria-hidden="true" className="text-informative" />,
    warning: <AlertTriangle aria-hidden="true" className="text-warning" />,
    error: <XCircle aria-hidden="true" className="text-destructive" />,
    loading: <Loader aria-hidden="true" className="animate-spin text-subtle" />,
  };
  const icon = type ? iconByType[type] : undefined;

  if (!icon) {
    return null;
  }

  return (
    <span className="shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none" data-slot="toast-icon">
      {icon}
    </span>
  );
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager();

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
  ));
}

export interface ToasterProps extends ToastProviderProps, SharedProps {
  container?: ToastPortalProps['container'];
}

function Toaster({ children, container, testId, toastManager = toast, ...props }: ToasterProps) {
  const portalContainer = usePortalContainer();

  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal container={container ?? portalContainer}>
        <ToastViewport testId={testId}>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

const createToastManager = ToastPrimitive.createToastManager;
const useToastManager = ToastPrimitive.useToastManager;

export {
  createToastManager,
  toast,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  Toaster,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
};
