import { Circle } from 'lucide-react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { forwardRef, type ComponentProps, type HTMLAttributes } from 'react';

import { Card, CardContent, CardDescription, CardHeader, type CardProps, CardTitle } from './card';
import { RadioGroup } from './radio-group';
import { cn } from '../lib/utils';

export type ChoiceboxProps = ComponentProps<typeof RadioGroup> & { testId?: string };

export const Choicebox = ({ className, testId, ...props }: ChoiceboxProps) => (
  <RadioGroup className={cn('w-full', className)} data-testid={testId} {...props} />
);

export type ChoiceboxItemProps = RadioGroupPrimitive.RadioGroupItemProps & { testId?: string } & Partial<
    Pick<CardProps, 'size'>
  >;

export const ChoiceboxItem = forwardRef<HTMLButtonElement, ChoiceboxItemProps>(
  ({ className, children, testId, size, checked, ...props }, ref) => (
    <RadioGroupPrimitive.Item {...props} ref={ref} className="group" checked={checked}>
      <Card
        size={size}
        className={cn(
          'flex cursor-pointer flex-row items-start justify-between rounded-md p-4 shadow-none transition-all border-2 border-solid text-left',
          checked && '!border-selected',
          'hover:shadow-elevated',
          className,
        )}
        data-testid={testId}
      >
        {children}
      </Card>
    </RadioGroupPrimitive.Item>
  ),
);

ChoiceboxItem.displayName = 'ChoiceboxItem';

export type ChoiceboxItemHeaderProps = ComponentProps<typeof CardHeader>;

export const ChoiceboxItemHeader = ({ className, ...props }: ComponentProps<typeof CardHeader>) => (
  <CardHeader className={cn('flex-1 p-0', className)} {...props} />
);

export type ChoiceboxItemTitleProps = ComponentProps<typeof CardTitle>;

export const ChoiceboxItemTitle = ({ className, ...props }: ChoiceboxItemTitleProps) => (
  <CardTitle className={cn('flex items-center gap-3', className)} {...props} />
);

export type ChoiceboxItemSubtitleProps = HTMLAttributes<HTMLSpanElement>;

export const ChoiceboxItemSubtitle = ({ className, ...props }: ChoiceboxItemSubtitleProps) => (
  <span className={cn('font-normal text-muted-foreground text-xs', className)} {...props} />
);

export type ChoiceboxItemDescriptionProps = ComponentProps<typeof CardDescription>;

export const ChoiceboxItemDescription = ({ className, ...props }: ChoiceboxItemDescriptionProps) => (
  <CardDescription className={cn('text-sm', className)} {...props} />
);

export type ChoiceboxItemContentProps = ComponentProps<typeof CardContent>;

export const ChoiceboxItemContent = ({ className, ...props }: ChoiceboxItemContentProps) => (
  <CardContent
    className={cn(
      'flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border border-input p-0 text-selected shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
      className,
    )}
    {...props}
  />
);

export type ChoiceboxItemIndicatorProps = ComponentProps<typeof RadioGroupPrimitive.Indicator> & {
  transition?: Transition;
};

export const ChoiceboxItemIndicator = ({
  className,
  transition = { type: 'spring', stiffness: 200, damping: 16 },
  ...props
}: ChoiceboxItemIndicatorProps) => (
  <RadioGroupPrimitive.Indicator
    data-slot="radio-group-indicator"
    className={cn('flex items-center justify-center', className)}
    {...props}
  >
    <AnimatePresence>
      <motion.div
        key="radio-group-indicator-circle"
        data-slot="radio-group-indicator-circle"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0 }}
        transition={transition}
      >
        <Circle className="size-2.5 fill-current text-current" />
      </motion.div>
    </AnimatePresence>
  </RadioGroupPrimitive.Indicator>
);
