/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { AlertTriangle, CheckCircle, Info, Loader, XCircle } from 'lucide-react';
import { Suspense, use } from 'react';
import { browser, createPortal } from 'react-dom';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/**
 * Hosts the remaining `toast` calls from `sonner`. The registry retired its Sonner wrapper, so this is
 * its last copy; new code toasts through `showToast` in `utils/toast.utils`. Delete once nothing
 * imports `sonner`.
 */
export function SonnerToaster(props: ToasterProps) {
  return (
    <Suspense fallback={null}>
      <BrowserToaster {...props} />
    </Suspense>
  );
}

// Theme comes from the caller: embedded and federated roots mount this without a ThemeProvider.
const BrowserToaster = ({ theme = 'system', ...props }: ToasterProps) => {
  use(browser('Toast notifications render into document.body.'));

  if (typeof document === 'undefined') {
    throw new Error('SonnerToaster requires a browser document after browser() resolves.');
  }

  return createPortal(
    <Sonner
      className="toaster group"
      data-slot="toaster"
      icons={{
        success: (
          <span className="text-success">
            <CheckCircle className="h-4 w-4" />
          </span>
        ),
        info: (
          <span className="text-informative">
            <Info className="h-4 w-4" />
          </span>
        ),
        warning: (
          <span className="text-warning">
            <AlertTriangle className="h-4 w-4" />
          </span>
        ),
        error: (
          <span className="text-destructive">
            <XCircle className="h-4 w-4" />
          </span>
        ),
        loading: (
          <span className="inline-flex animate-spin text-subtle">
            <Loader className="h-4 w-4" />
          </span>
        ),
      }}
      theme={theme}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-subtle',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-surface-subtle group-[.toast]:text-subtle',
          closeButton: 'group-[.toast]:bg-surface-subtle group-[.toast]:text-subtle',
        },
      }}
      {...props}
    />,
    document.body
  );
};
