import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { animate } from 'motion/react';
import React from 'react';

import { Button } from '../components/button';
import { usePortalContainer } from '../lib/use-portal-container';
import {
  asChildTrigger,
  narrowOpenChange,
  renderDescription,
  renderWithDataState,
  warnDeprecatedProp,
} from '../lib/base-ui-compat';
import { cn, type FixedPositionContentProps, type SharedProps } from '../lib/utils';

type DialogRootProps = Omit<React.ComponentProps<typeof DialogPrimitive.Root>, 'onOpenChange'> &
  SharedProps & {
    onOpenChange?: (open: boolean) => void;
  };

function Dialog({ testId, onOpenChange, ...props }: DialogRootProps) {
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      data-testid={testId}
      onOpenChange={narrowOpenChange(onOpenChange)}
      {...props}
    />
  );
}

type DialogTriggerProps = React.ComponentProps<typeof DialogPrimitive.Trigger> & {
  asChild?: boolean;
};

function DialogTrigger({ className, ...props }: DialogTriggerProps) {
  return (
    <DialogPrimitive.Trigger
      className={cn('cursor-pointer', className)}
      data-slot="dialog-trigger"
      {...asChildTrigger(props)}
    />
  );
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

type DialogCloseProps = React.ComponentProps<typeof DialogPrimitive.Close> & {
  asChild?: boolean;
};

function DialogClose({ ...props }: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...asChildTrigger(props)} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      // fill-mode-forwards holds the exit keyframe until Base UI unmounts;
      // without it the backdrop flashes back to its natural opacity for one frame.
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 fill-mode-forwards backdrop-blur-xs data-[state=closed]:animate-out data-[state=open]:animate-in',
        className
      )}
      data-slot="dialog-overlay"
      render={renderWithDataState('div')}
      {...props}
    />
  );
}

const dialogContentVariants = cva(
  // Auto-height changes go through useAnimatedAutoHeight; this transition only smooths fixed-size variant swaps.
  'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 flex w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-xl border bg-background fill-mode-forwards shadow-lg transition-[max-height,min-height] duration-200 ease-out data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:transition-none',
  {
    variants: {
      size: {
        sm: 'sm:max-w-sm',
        md: 'sm:max-w-lg',
        lg: 'sm:max-w-2xl',
        xl: 'sm:max-w-4xl',
        full: 'sm:max-w-[90vw]',
      },
      variant: {
        standard: '',
        centered: 'text-center',
        destructive: 'border-destructive/50',
      },
      // `auto` grows with content; the fixed sizes lock height so multi-view dialogs don't reflow between steps.
      height: {
        auto: 'max-h-[85vh]',
        sm: 'h-[min(85vh,400px)]',
        md: 'h-[min(85vh,560px)]',
        lg: 'h-[min(85vh,720px)]',
        xl: 'h-[min(85vh,880px)]',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'standard',
      height: 'auto',
    },
  }
);

// Animates the popup between natural heights when content changes in `auto` mode.
// Uses a state-backed ref so the effect re-runs when Base UI's portal mounts the popup.
function useAnimatedAutoHeight(enabled: boolean) {
  const [popup, setPopup] = React.useState<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (!(enabled && popup)) {
      return;
    }

    let lastObserved = popup.offsetHeight;
    let expectedHeight: number | null = null;
    let activeAnimation: ReturnType<typeof animate> | null = null;

    const observer = new ResizeObserver(() => {
      const measured = popup.offsetHeight;

      // Ignore echoes from heights we set ourselves during the animation.
      if (expectedHeight !== null && Math.abs(measured - expectedHeight) < 1) {
        return;
      }
      if (Math.abs(measured - lastObserved) < 1) {
        return;
      }

      const from = lastObserved;
      const to = measured;
      lastObserved = to;

      activeAnimation?.stop();
      // Pin to the old height before the next paint so the animation has a start frame.
      popup.style.height = `${from}px`;
      expectedHeight = from;

      activeAnimation = animate(from, to, {
        duration: 0.25,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (value) => {
          expectedHeight = value;
          popup.style.height = `${value}px`;
        },
        onComplete: () => {
          popup.style.height = '';
          expectedHeight = null;
          activeAnimation = null;
        },
      });
    });

    observer.observe(popup);

    return () => {
      activeAnimation?.stop();
      observer.disconnect();
      popup.style.height = '';
    };
  }, [enabled, popup]);

  return setPopup;
}

interface DialogContentProps
  extends React.ComponentProps<typeof DialogPrimitive.Popup>,
    VariantProps<typeof dialogContentVariants>,
    SharedProps,
    Pick<FixedPositionContentProps, 'container' | 'showOverlay' | 'onOpenAutoFocus'> {
  showCloseButton?: boolean;
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showOverlay = true,
  size,
  variant,
  height,
  testId,
  container,
  onOpenAutoFocus,
  ...props
}: DialogContentProps) {
  warnDeprecatedProp(
    'DialogContent',
    'onOpenAutoFocus',
    onOpenAutoFocus,
    'Use `initialFocus` on Base UI `Dialog.Popup` instead.'
  );
  const portalContainer = usePortalContainer();
  const isAutoHeight = !height || height === 'auto';
  const setPopupRef = useAnimatedAutoHeight(isAutoHeight);
  return (
    <DialogPortal container={container ?? portalContainer}>
      {showOverlay ? <DialogOverlay /> : null}
      <DialogPrimitive.Popup
        className={cn(dialogContentVariants({ size, variant, height }), className)}
        data-slot="dialog-content"
        data-testid={testId}
        ref={setPopupRef}
        render={renderWithDataState('div')}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            render={
              <Button
                aria-label="Close"
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                size="icon-sm"
                variant="ghost"
              >
                <X />
              </Button>
            }
          />
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

const dialogHeaderVariants = cva('flex shrink-0 flex-col p-4 [&:has(+[data-slot=dialog-body])]:border-b', {
  variants: {
    align: {
      left: 'text-left',
      center: 'text-center',
      responsive: 'text-center sm:text-left',
    },
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-1.5',
      loose: 'space-y-2',
    },
  },
  defaultVariants: {
    align: 'responsive',
    spacing: 'normal',
  },
});

interface DialogHeaderProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogHeaderVariants> {}

function DialogHeader({ className, align, spacing, ...props }: DialogHeaderProps) {
  return (
    <div className={cn(dialogHeaderVariants({ align, spacing }), className)} data-slot="dialog-header" {...props} />
  );
}

const dialogFooterVariants = cva('flex shrink-0 p-4 [[data-slot=dialog-body]+&]:border-t', {
  variants: {
    direction: {
      column: 'flex-col',
      row: 'flex-row items-center',
      responsive: 'flex-col-reverse sm:flex-row sm:items-center',
    },
    justify: {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end sm:justify-end',
      between: 'justify-between',
    },
    gap: {
      sm: 'gap-1',
      md: 'gap-2',
      lg: 'gap-4',
    },
  },
  defaultVariants: {
    direction: 'responsive',
    justify: 'end',
    gap: 'md',
  },
});

interface DialogFooterProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogFooterVariants> {}

function DialogFooter({ className, direction, justify, gap, ...props }: DialogFooterProps) {
  return (
    <div
      className={cn(dialogFooterVariants({ direction, justify, gap }), className)}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('font-semibold text-lg leading-none tracking-tight', className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  children,
  asChild,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description> & { asChild?: boolean }) {
  // Render as <div> (not <p>) so block-level children don't trigger validateDOMNesting.
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      render={renderDescription({
        asChild,
        children,
        className: typeof className === 'string' ? className : undefined,
        dataSlot: 'dialog-description',
      })}
      {...props}
    />
  );
}

// Padding lives on the inner wrapper so scroll shadows can sit flush against the body edges.
const dialogBodyContainerVariants = cva('relative min-h-0 flex-1 overflow-y-auto');

const dialogBodyContentVariants = cva('p-4', {
  variants: {
    spacing: {
      none: '',
      sm: 'space-y-2',
      md: 'space-y-4',
      lg: 'space-y-6',
    },
  },
  defaultVariants: {
    spacing: 'md',
  },
});

const SCROLL_EDGE_THRESHOLD = 2;

interface DialogBodyProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogBodyContentVariants> {
  /** Show fading top/bottom shadows when the body overflows. Defaults to `true`. */
  scrollShadow?: boolean;
}

function DialogBody({ className, spacing, scrollShadow = true, children, style, ...props }: DialogBodyProps) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = React.useState({ top: false, bottom: false });

  React.useEffect(() => {
    if (!scrollShadow) {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      setEdges({
        top: scrollTop > SCROLL_EDGE_THRESHOLD,
        bottom: scrollTop + clientHeight < scrollHeight - SCROLL_EDGE_THRESHOLD,
      });
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // Observe children too so a collapsing/expanding section re-evaluates the shadows.
    for (const child of Array.from(el.children)) {
      if (child instanceof HTMLElement) {
        ro.observe(child);
      }
    }

    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollShadow]);

  return (
    <div
      className={cn(dialogBodyContainerVariants(), className)}
      data-slot="dialog-body"
      ref={ref}
      style={style}
      {...props}
    >
      {scrollShadow ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none sticky top-0 z-10 h-0 transition-opacity duration-150',
            edges.top ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="absolute inset-x-0 top-0 h-3 bg-gradient-to-b from-black/[0.10] to-transparent" />
        </div>
      ) : null}
      <div className={cn(dialogBodyContentVariants({ spacing }))}>{children}</div>
      {scrollShadow ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none sticky bottom-0 z-10 h-0 transition-opacity duration-150',
            edges.bottom ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/[0.10] to-transparent" />
        </div>
      ) : null}
    </div>
  );
}

const dialogFieldVariants = cva('flex flex-col', {
  variants: {
    spacing: {
      tight: 'space-y-1',
      normal: 'space-y-1.5',
      loose: 'space-y-2',
    },
  },
  defaultVariants: {
    spacing: 'normal',
  },
});

interface DialogFieldProps extends React.ComponentProps<'div'>, VariantProps<typeof dialogFieldVariants> {}

function DialogField({ className, spacing, ...props }: DialogFieldProps) {
  return <div className={cn(dialogFieldVariants({ spacing }), className)} {...props} />;
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogField,
};
