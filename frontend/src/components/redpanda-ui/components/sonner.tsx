'use client';

import { AlertTriangle, CheckCircle, Info, Loader, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { useTheme } from './theme-provider';
import type { SharedProps } from '../lib/utils';

const Toaster = ({ testId, ...props }: ToasterProps & SharedProps) => {
  const { theme = 'system' } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return null;
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
