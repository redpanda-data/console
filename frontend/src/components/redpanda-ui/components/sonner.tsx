'use client';

import { AlertTriangle, CheckCircle, Info, Loader, XCircle } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps & { theme?: 'light' | 'dark' | 'system' }) => {
  return (
    <Sonner
      theme={props.theme}
      className="toaster group"
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
      icons={{
        success: <CheckCircle className="h-4 w-4 text-green-500" />,
        info: <Info className="h-4 w-4 text-blue-500" />,
        warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        error: <XCircle className="h-4 w-4 text-red-500" />,
        loading: <Loader className="h-4 w-4 text-gray-500 animate-spin" />,
      }}
      {...props}
    />
  );
};

export { Toaster };
