'use client';

import { AlertTriangle, CheckCircle, Info, Loader, XCircle } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps & { theme?: 'light' | 'dark' | 'system' }) => (
  <Sonner
    className="toaster group"
    icons={{
      success: <CheckCircle className="h-4 w-4 text-success" />,
      info: <Info className="h-4 w-4 text-info" />,
      warning: <AlertTriangle className="h-4 w-4 text-warning" />,
      error: <XCircle className="h-4 w-4 text-destructive" />,
      loading: <Loader className="h-4 w-4 animate-spin text-muted-foreground" />,
    }}
    theme={props.theme}
    toastOptions={{
      classNames: {
        toast:
          'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        closeButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
      },
    }}
    {...props}
  />
);

export { Toaster };
