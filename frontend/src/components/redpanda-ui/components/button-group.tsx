import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import type { VariantProps } from 'class-variance-authority';

import { Separator } from './separator';
import { cn, type DataAttributes, type SharedProps } from '../lib/utils';
import { buttonGroupVariants } from './button-group/variants';

function ButtonGroup({
  className,
  orientation,
  testId,
  ...props
}: React.ComponentProps<'fieldset'> & VariantProps<typeof buttonGroupVariants> & SharedProps) {
  return (
    <fieldset
      className={cn(buttonGroupVariants({ orientation }), className)}
      data-orientation={orientation}
      data-slot="button-group"
      data-testid={testId}
      {...props}
    />
  );
}

function ButtonGroupText({ className, render, testId, ...props }: useRender.ComponentProps<'div'> & SharedProps) {
  const elementProps = {
    className: cn(
      "flex items-center gap-2 rounded-md border bg-surface-subtle px-4 text-body font-medium shadow-xs [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
      className
    ),
    'data-slot': 'button-group-text',
    'data-testid': testId,
  } satisfies React.ComponentPropsWithRef<'div'> & DataAttributes;

  return useRender({
    defaultTagName: 'div',
    render,
    props: mergeProps<'div'>(elementProps, props),
  });
}

function ButtonGroupSeparator({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        'relative self-stretch data-[orientation=horizontal]:mx-px data-[orientation=horizontal]:w-auto data-[orientation=vertical]:my-px data-[orientation=vertical]:h-auto',
        className
      )}
      data-slot="button-group-separator"
      orientation={orientation}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText };
