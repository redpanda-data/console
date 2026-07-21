import { Radio as RadioGroupPrimitive } from '@base-ui/react/radio';
import { Circle } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';

import { Card, CardContent, CardDescription, CardHeader, type CardProps, CardTitle } from './card';
import { RadioGroup } from './radio-group';
import { cn, type SharedProps } from '../lib/utils';

export type ChoiceboxProps = ComponentProps<typeof RadioGroup> & SharedProps;

export const Choicebox = ({ className, testId, ...props }: ChoiceboxProps) => (
  <RadioGroup className={cn('w-full', className)} data-testid={testId} {...props} />
);

export type ChoiceboxItemProps = ComponentProps<typeof RadioGroupPrimitive.Root> &
  SharedProps &
  Partial<Pick<CardProps, 'size'>>;

export const ChoiceboxItem = ({ className, children, testId, size, ...props }: ChoiceboxItemProps) => (
  <RadioGroupPrimitive.Root {...props} className="group">
    <Card
      className={cn(
        'flex cursor-pointer flex-row items-start justify-between rounded-md border-2 border-solid p-4 text-left shadow-none transition-all',
        'group-data-[checked]:!border-selected',
        'hover:shadow-elevated',
        className
      )}
      data-testid={testId}
      size={size}
    >
      {children}
    </Card>
  </RadioGroupPrimitive.Root>
);

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
      'group-data-[checked]:!border-selected',
      className
    )}
    {...props}
  />
);

export type ChoiceboxItemIndicatorProps = ComponentProps<typeof RadioGroupPrimitive.Indicator>;

export const ChoiceboxItemIndicator = ({ className, ...props }: ChoiceboxItemIndicatorProps) => (
  <RadioGroupPrimitive.Indicator
    className={cn(
      'flex items-center justify-center transition-[opacity,transform] duration-150 ease-out',
      'data-[starting-style]:scale-0 data-[starting-style]:opacity-0',
      'data-[ending-style]:scale-0 data-[ending-style]:opacity-0',
      className
    )}
    data-slot="radio-group-indicator"
    {...props}
  >
    <Circle className="size-2.5 fill-current text-current" data-slot="radio-group-indicator-circle" />
  </RadioGroupPrimitive.Indicator>
);
