'use client';

import { AlertTriangle, CheckCircle, Info, Loader, XCircle } from 'lucide-react';
import { Suspense, use } from 'react';
import { browser, createPortal } from 'react-dom';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from './theme-provider';
import type { SharedProps } from '../lib/utils';

function Toaster(props: ToasterProps & SharedProps) {
  return (
    <Suspense fallback={null}>
      <BrowserToaster {...props} />
    </Suspense>
  );
}

const BrowserToaster = ({ testId, ...props }: ToasterProps & SharedProps) => {
  use(browser('Toast notifications render into document.body.'));
  const { theme = 'system' } = useTheme();

  // React Doctor's SSR analyzer does not yet recognize browser(); fail loudly if its contract breaks.
  if (typeof document === 'undefined') {
    throw new Error('Toaster requires a browser document after browser() resolves.');
  }

  return createPortal(
    <Sonner
      className="toaster group"
      data-slot="toaster"
      data-testid={testId}
      icons={{
        success: <CheckCircle className="h-4 w-4 text-success" />,
        info: <Info className="h-4 w-4 text-informative" />,
        warning: <AlertTriangle className="h-4 w-4 text-warning" />,
        error: <XCircle className="h-4 w-4 text-destructive" />,
        loading: <Loader className="h-4 w-4 animate-spin text-subtle" />,
      }}
      theme={props.theme ?? theme}
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

export { Toaster };
