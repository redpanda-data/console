'use client';

import { withAgentChanges } from '../lib/commit-agent-change';
import * as CalendarPrimitive from '@ui-sdk/react/calendar';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ComponentProps } from 'react';

import { buttonVariants } from './button';
import { cn, type SharedProps } from '../lib/utils';

type CalendarProps = ComponentProps<typeof CalendarPrimitive.Calendar> & SharedProps;
function Calendar({ className, testId, ...props }: CalendarProps) {
  const navigationClass = cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }));
  return (
    <CalendarPrimitive.Calendar
      aria-label="Choose date"
      className={cn('w-fit bg-background p-3', className)}
      data-testid={testId}
      {...withAgentChanges(props)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <CalendarPrimitive.CalendarPrevious className={navigationClass} aria-label="Previous month">
          <ChevronLeftIcon className="size-4" />
        </CalendarPrimitive.CalendarPrevious>
        <CalendarPrimitive.CalendarHeading className="font-semibold text-body" />
        <CalendarPrimitive.CalendarNext className={navigationClass} aria-label="Next month">
          <ChevronRightIcon className="size-4" />
        </CalendarPrimitive.CalendarNext>
      </div>
      <CalendarPrimitive.CalendarGrid className="w-full border-collapse">
        <CalendarPrimitive.CalendarWeekdays>
          {(index) => (
            <CalendarPrimitive.CalendarWeekday
              key={index}
              index={index}
              className="size-8 text-center font-normal text-body-sm text-subtle"
            />
          )}
        </CalendarPrimitive.CalendarWeekdays>
        <CalendarPrimitive.CalendarWeeks>
          {(cell) => (
            <CalendarPrimitive.CalendarDay
              key={cell.date}
              value={cell.date}
              className="size-8 p-0 text-center [&>button]:size-8 [&>button]:cursor-pointer [&>button]:rounded-md [&>button]:text-body [&>button]:outline-none [&>button]:hover:bg-accent [&>button]:focus-visible:ring-2 [&>button]:focus-visible:ring-ring data-selected:[&>button]:bg-selected data-selected:[&>button]:text-selected-foreground data-today:[&>button]:font-semibold data-outside:opacity-40 data-disabled:opacity-40"
            />
          )}
        </CalendarPrimitive.CalendarWeeks>
      </CalendarPrimitive.CalendarGrid>
    </CalendarPrimitive.Calendar>
  );
}
export { Calendar };
export type { CalendarProps };
