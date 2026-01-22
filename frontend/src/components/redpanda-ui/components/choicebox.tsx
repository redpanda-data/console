import { Circle } from 'lucide-react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { type ComponentProps, forwardRef, type HTMLAttributes } from 'react';

import { Card, CardContent, CardDescription, CardHeader, type CardProps, CardTitle } from './card';
import { RadioGroup } from './radio-group';
import { cn, type SharedProps } from '../lib/utils';

export type ChoiceboxProps = ComponentProps<typeof RadioGroup> & SharedProps;

export const Choicebox = ({ className, testId, ...props }: ChoiceboxProps) => (
  <RadioGroup className={cn('w-full', className)} data-testid={testId} {...props} />
);

export type ChoiceboxItemProps = RadioGroupPrimitive.RadioGroupItemProps &
  SharedProps &
  Partial<Pick<CardProps, 'size'>>;

export const ChoiceboxItem = forwardRef<HTMLButtonElement, ChoiceboxItemProps>(
  ({ className, children, testId, size, checked, ...props }, ref) => (
    <RadioGroupPrimitive.Item {...props} checked={checked} className="group" ref={ref}>
      <Card
        className={cn(
          'flex cursor-pointer flex-row items-start justify-between rounded-md border-2 border-solid p-4 text-left shadow-none transition-all',
          checked && '!border-selected',
          'hover:shadow-elevated',
          className
        )}
        data-testid={testId}
        size={size}
      >
        {children}
      </Card>
    </RadioGroupPrimitive.Item>
  )
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
      '!border-input flex aspect-square size-4 shrink-0 items-center justify-center rounded-full border p-0 text-selected shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
      className
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
    className={cn('flex items-center justify-center', className)}
    data-slot="radio-group-indicator"
    {...props}
  >
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        data-slot="radio-group-indicator-circle"
        exit={{ opacity: 0, scale: 0 }}
        initial={{ opacity: 0, scale: 0 }}
        key="radio-group-indicator-circle"
        transition={transition}
      >
        <Circle className="size-2.5 fill-current text-current" />
      </motion.div>
    </AnimatePresence>
  </RadioGroupPrimitive.Indicator>
);
