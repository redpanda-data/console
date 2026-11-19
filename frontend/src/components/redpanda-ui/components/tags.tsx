'use client';

import { XIcon } from 'lucide-react';
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type MouseEventHandler,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button } from './button';
import { buttonVariants } from './button/variants';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn, type SharedProps } from '../lib/utils';
import { requireDefined } from '../lib/utils/require-defined';

interface TagsContextType {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  setValue?: ((value: string) => void) | undefined;
  setWidth?: ((width: number) => void) | undefined;
  value?: string | undefined;
  width?: number | undefined;
}
const TagsContext = createContext<TagsContextType | null>(null);

const useTagsContext = () => {
  const context = useContext(TagsContext);
  if (context === null) {
    throw new Error('useTagsContext must be used within a TagsProvider');
  }
  return context;
};

export type TagsProps = {
  value?: string | undefined;
  setValue?: ((value: string) => void) | undefined;
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  children?: ReactNode | undefined;
  className?: string | undefined;
} & SharedProps;

export const Tags = ({
  value,
  setValue,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
  className,
  testId,
}: TagsProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [width, setWidth] = useState<number>();
  const ref = useRef<HTMLDivElement>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange ?? setUncontrolledOpen;
  useEffect(() => {
    if (ref.current === null) {
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      setWidth(requireDefined(entries[0], 'index.tsx: expected entries[0]').contentRect.width);
    });
    resizeObserver.observe(ref.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  return (
    <TagsContext.Provider value={{ value, setValue, open, onOpenChange, width, setWidth }}>
      <Popover onOpenChange={onOpenChange} open={open}>
        <div className={cn('relative w-full', className)} data-testid={testId} ref={ref}>
          {children}
        </div>
      </Popover>
    </TagsContext.Provider>
  );
};
export type TagsTriggerProps = ComponentProps<'div'> & { testId?: string | undefined };
export const TagsTrigger = ({ className, children, testId, 'aria-label': label, ...props }: TagsTriggerProps) => {
  useTagsContext();
  return (
    <PopoverTrigger
      aria-label={label ?? 'Tags'}
      nativeButton={false}
      render={
        <div
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-auto w-full min-w-0 justify-between p-2 whitespace-normal hover:bg-accent active:bg-accent-pressed',
            className
          )}
          data-testid={testId}
          {...props}
          data-slot="tags-trigger"
        >
          <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
            {children}
            <span className="px-2 py-px text-subtle">Select a tag...</span>
          </div>
        </div>
      }
      role="combobox"
      tabIndex={0}
    />
  );
};
export type TagsValueProps = ComponentProps<'span'> & { testId?: string | undefined } & (
    | { onRemove: () => void; removeLabel: string }
    | { onRemove?: undefined; removeLabel?: never }
  );
export const TagsValue = ({ className, children, onRemove, removeLabel, testId, ...props }: TagsValueProps) => {
  const handleRemove: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget.closest('[data-slot="tags-trigger"]');
    if (trigger instanceof HTMLElement) {
      trigger.focus();
    }
    onRemove?.();
  };
  return (
    <span
      className={cn(
        'inline-flex min-h-6 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md bg-surface-subtle px-2 py-1 text-body font-medium text-strong transition-colors hover:bg-surface-subtle-hover active:bg-surface-subtle-pressed motion-reduce:transition-none',
        className
      )}
      data-testid={testId}
      {...props}
    >
      <span className="min-w-0 leading-tight [overflow-wrap:anywhere] whitespace-normal">{children}</span>
      {onRemove === undefined ? null : (
        <Button
          aria-label={removeLabel}
          className="shrink-0"
          onClick={handleRemove}
          size="icon-xs"
          type="button"
          variant="destructive-ghost"
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </span>
  );
};

export type TagsContentProps = ComponentProps<typeof PopoverContent>;
export const TagsContent = ({ className, children, style, ...props }: TagsContentProps) => {
  const { width } = useTagsContext();
  const label = props['aria-label'] ?? 'Search tags';
  const measuredWidth: CSSProperties & { '--tags-width': string | undefined } = {
    '--tags-width': width === undefined ? undefined : `${width}px`,
  };
  return (
    <PopoverContent
      className={cn(className, style === undefined && width !== undefined && 'w-(--tags-width)')}
      padding="none"
      style={style ?? measuredWidth}
      {...props}
      aria-label={label}
    >
      <Command label={label}>{children}</Command>
    </PopoverContent>
  );
};

export type TagsInputProps = ComponentProps<typeof CommandInput>;
export const TagsInput = ({ className, ...props }: TagsInputProps) => (
  <CommandInput className={cn('h-9', className)} {...props} />
);
export type TagsListProps = ComponentProps<typeof CommandList>;
export const TagsList = ({ className, ...props }: TagsListProps) => (
  <CommandList className={cn('max-h-[200px]', className)} {...props} />
);

export type TagsEmptyProps = ComponentProps<typeof CommandEmpty>;
export const TagsEmpty = ({ children, className, ...props }: TagsEmptyProps) => (
  <CommandEmpty className={className} {...props}>
    {children ?? 'No tags found.'}
  </CommandEmpty>
);

export type TagsGroupProps = ComponentProps<typeof CommandGroup>;
export const TagsGroup = CommandGroup;

export type TagsItemProps = ComponentProps<typeof CommandItem>;
export const TagsItem = ({ className, ...props }: TagsItemProps) => (
  <CommandItem className={cn('cursor-pointer items-center justify-between', className)} {...props} />
);
