/**
 * Custom dialog close button with a minimum 24x24px icon for accessibility.
 * Use with `showCloseButton={false}` on DialogContent.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { DialogClose } from 'components/redpanda-ui/components/dialog';
import { cn } from 'components/redpanda-ui/lib/utils';
import { X } from 'lucide-react';

const dialogCloseButtonVariants = cva(
  'absolute rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:pointer-events-none',
  {
    variants: {
      size: {
        small: 'top-2 right-2 [&_svg]:size-4',
        medium: 'top-4 right-4 [&_svg]:size-6',
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  }
);

function DialogCloseButton({
  className,
  size,
  ...props
}: React.ComponentProps<typeof DialogClose> & VariantProps<typeof dialogCloseButtonVariants>) {
  return (
    <DialogClose className={cn(dialogCloseButtonVariants({ size }), className)} {...props}>
      <X />
      <span className="sr-only">Close</span>
    </DialogClose>
  );
}

export { DialogCloseButton };
