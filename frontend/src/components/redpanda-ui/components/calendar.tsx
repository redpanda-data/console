'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import React from 'react';
import { type DayButton, DayPicker, type DayPickerProps, getDefaultClassNames, type Matcher } from 'react-day-picker';
import type { Button } from './button';
import { buttonVariants } from './button/variants';
import { cn, type SharedProps } from '../lib/utils';

const calendarVariants = cva(
  'group/calendar bg-background p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent',
  {
    variants: {
      variant: {
        default: '',
        outlined: 'rounded-lg border',
        elevated: 'rounded-lg border shadow-sm',
        embedded: 'bg-transparent p-0',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function CalendarRoot({
  className,
  rootRef,
  ...props
}: React.ComponentProps<'div'> & { rootRef?: React.Ref<HTMLDivElement> | undefined }) {
  return <div className={cn(className)} data-slot="calendar" ref={rootRef} {...props} />;
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: {
  className?: string | undefined;
  orientation?: 'left' | 'right' | 'down' | 'up' | undefined;
}) {
  if (orientation === 'left') {
    return <ChevronLeftIcon className={cn('size-4', className)} {...props} />;
  }

  if (orientation === 'right') {
    return <ChevronRightIcon className={cn('size-4', className)} {...props} />;
  }

  return <ChevronDownIcon className={cn('size-4', className)} {...props} />;
}

function CalendarWeekNumber({ children, ...props }: React.ComponentProps<'td'>) {
  return (
    <td {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">{children}</div>
    </td>
  );
}

type CalendarSelectionProps<Props> = Props extends unknown
  ? Omit<Props, 'classNames' | 'styles' | 'modifiersClassNames' | 'modifiersStyles'>
  : never;

export type CalendarProps = CalendarSelectionProps<DayPickerProps> &
  VariantProps<typeof calendarVariants> &
  SharedProps & {
    /** Mark booked dates with the owned struck-through treatment. Use disabled to prevent selection. */
    booked?: Matcher | Matcher[] | undefined;
    /** Appearance of the month navigation controls, not the date actions. */
    buttonVariant?: React.ComponentProps<typeof Button>['variant'] | undefined;
  };

function Calendar({
  className,
  variant,
  booked,
  modifiers,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  locale,
  formatters,
  components,
  testId,
  ...props
}: CalendarProps) {
  if ('classNames' in props || 'styles' in props || 'modifiersClassNames' in props || 'modifiersStyles' in props) {
    throw new Error('Calendar no longer accepts day paint maps. Use surface variants and the booked matcher.');
  }
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      captionLayout={captionLayout}
      className={cn(
        calendarVariants({ variant }),
        'rtl:**:[.rdp-button\\_next>svg]:rotate-180',
        'rtl:**:[.rdp-button\\_previous>svg]:rotate-180',
        className
      )}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', defaultClassNames.nav),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-body font-medium',
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          'relative rounded-md border !border-input shadow-xs has-focus:border-ring has-focus:ring-3 has-focus:ring-ring/50',
          defaultClassNames.dropdown_root
        ),
        dropdown: cn('absolute inset-0 opacity-0', defaultClassNames.dropdown),
        caption_label: cn(
          'font-medium select-none',
          captionLayout === 'label'
            ? 'text-body'
            : 'flex h-8 items-center gap-1 rounded-md pr-1 pl-2 text-body [&>svg]:size-3.5 [&>svg]:text-subtle',
          defaultClassNames.caption_label
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn('flex-1 rounded-md text-body-sm font-normal text-subtle select-none', defaultClassNames.weekday),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn('w-(--cell-size) select-none', defaultClassNames.week_number_header),
        week_number: cn('text-body-sm text-subtle select-none', defaultClassNames.week_number),
        day: cn(
          'group/day relative aspect-square size-full p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-md',
          props.showWeekNumber === true
            ? '[&:nth-child(2)[data-selected=true]_button]:rounded-l-md'
            : '[&:first-child[data-selected=true]_button]:rounded-l-md',
          defaultClassNames.day
        ),
        range_start: cn(
          'relative isolate z-0 rounded-l-md bg-accent after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-accent',
          defaultClassNames.range_start
        ),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn(
          'relative isolate z-0 rounded-r-md bg-accent after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-accent',
          defaultClassNames.range_end
        ),
        today: cn(
          'rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none',
          defaultClassNames.today
        ),
        outside: cn('text-subtle aria-selected:text-subtle', defaultClassNames.outside),
        disabled: cn('text-subtle opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
      }}
      components={{
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      data-testid={testId}
      formatters={{
        formatMonthDropdown: (date) => date.toLocaleString(locale?.code, { month: 'short' }),
        ...formatters,
      }}
      locale={locale}
      modifiers={{ ...modifiers, ...(booked === undefined ? {} : { booked }) }}
      modifiersClassNames={{ booked: 'opacity-100' }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

export type CalendarDayButtonProps = React.ComponentProps<typeof DayButton> & React.RefAttributes<HTMLButtonElement>;

/** Native DayPicker date action. Incoming className/style belong to DayPicker's internal protocol. */
function CalendarDayButton({ className, day, modifiers, ref: forwardedRef, ...props }: CalendarDayButtonProps) {
  const defaultClassNames = getDefaultClassNames();

  const ref = React.useRef<HTMLButtonElement>(null);
  const setDayRef = (node: HTMLButtonElement | null) => {
    ref.current = node;
    if (typeof forwardedRef === 'function') {
      const cleanup = forwardedRef(node);
      return () => {
        ref.current = null;
        if (typeof cleanup === 'function') {
          cleanup();
        } else {
          forwardedRef(null);
        }
      };
    }
    if (forwardedRef !== null && forwardedRef !== undefined) {
      forwardedRef.current = node;
    }
    return () => {
      ref.current = null;
      if (forwardedRef !== null && forwardedRef !== undefined) {
        forwardedRef.current = null;
      }
    };
  };
  const focused = modifiers['focused'] === true;
  React.useEffect(
    function focusCalendarDay() {
      if (focused) {
        ref.current?.focus();
      }
    },
    [focused]
  );

  return (
    <button
      {...props}
      className={cn(
        'items-center justify-center rounded-md font-normal whitespace-nowrap text-secondary outline-none',
        'shrink-0 cursor-pointer transition-[color,background-color,border-color,box-shadow,scale] motion-reduce:transition-none',
        'selection:bg-selection selection:text-selection-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-invalid',
        'bg-transparent hover:bg-secondary-wash active:scale-[0.98] active:bg-secondary-wash-pressed disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-disabled [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0',
        'relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-selected data-[range-end=true]:text-selected-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-selected data-[range-start=true]:text-selected-foreground data-[selected-single=true]:bg-selected data-[selected-single=true]:text-selected-foreground [&>span]:text-body-sm [&>span]:opacity-70',
        modifiers['booked'] === true && 'line-through',
        defaultClassNames.day,
        className
      )}
      data-booked={modifiers['booked']}
      data-day={day.isoDate}
      data-range-end={modifiers['range_end']}
      data-range-middle={modifiers['range_middle']}
      data-range-start={modifiers['range_start']}
      data-selected-single={
        modifiers['selected'] === true &&
        modifiers['range_start'] !== true &&
        modifiers['range_end'] !== true &&
        modifiers['range_middle'] !== true
      }
      data-slot="button"
      ref={setDayRef}
      type={props.type ?? 'button'}
    />
  );
}

export { Calendar, CalendarDayButton };
