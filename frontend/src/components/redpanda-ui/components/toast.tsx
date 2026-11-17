// Copyright 2026 Redpanda Data, Inc.

'use client';

import * as ToastPrimitive from '@ui-sdk/react/toast';
import { AlertTriangle, CheckCircle, Info, Loader, X, XCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

import { usePortalContainer } from '../lib/use-portal-container';
import { cn, type SharedProps } from '../lib/utils';

const icons = {
  default: Info,
  info: Info,
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  loading: Loader,
};
type ToasterProps = Omit<ComponentProps<typeof ToastPrimitive.ToastRegion>, 'children'> & SharedProps;
function Toaster({ className, testId, container, ...props }: ToasterProps) {
  const portalContainer = usePortalContainer();
  return (
    <ToastPrimitive.ToastRegion
      aria-label="Console notifications"
      data-agent-hidden="true"
      data-testid={testId}
      side="top"
      align="end"
      expanded
      toaster={toast}
      maxVisible={3}
      container={container ?? portalContainer}
      className={cn('fixed top-4 right-4 z-100 flex w-90 max-w-[calc(100vw-2rem)] flex-col gap-3', className)}
      {...props}
    >
      {(notification) => {
        const Icon = icons[notification.type];
        return (
          <ToastPrimitive.Toast
            data-testid={
              typeof notification.data === 'object' &&
              notification.data !== null &&
              'testId' in notification.data &&
              typeof notification.data.testId === 'string'
                ? notification.data.testId
                : undefined
            }
            className="relative flex items-start gap-3 rounded-lg border border-border bg-popover p-4 pr-9 text-popover-foreground shadow-lg transition-[opacity,translate] duration-200 data-starting-style:translate-x-4 data-ending-style:translate-x-4 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none"
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'mt-0.5 size-4 shrink-0',
                notification.type === 'loading' && 'animate-spin motion-reduce:animate-none',
                notification.type === 'error' && 'text-destructive',
                notification.type === 'success' && 'text-success',
                notification.type === 'warning' && 'text-warning',
                notification.type === 'info' && 'text-informative'
              )}
            />
            <div className="min-w-0 flex-1 space-y-1">
              <ToastPrimitive.ToastTitle className="font-semibold text-body" />
              <ToastPrimitive.ToastDescription className="text-body-sm text-subtle break-words" />
              <ToastPrimitive.ToastAction className="text-body-sm font-medium underline" />
            </div>
            <ToastPrimitive.ToastClose
              aria-label="Dismiss notification"
              className="absolute top-3 right-3 cursor-pointer rounded-sm p-1 text-subtle hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </ToastPrimitive.ToastClose>
          </ToastPrimitive.Toast>
        );
      }}
    </ToastPrimitive.ToastRegion>
  );
}
export const toast = ToastPrimitive.createToaster({ duration: 4000 });
export { Toaster };
export type { ToasterProps };
