/** biome-ignore-all lint/a11y/useSemanticElements: part of tags component */
'use client';

import { XIcon } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type MouseEventHandler,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { Button } from './button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { cn, type SharedProps } from '../lib/utils';

type TagsContextType = {
  value?: string;
  setValue?: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
  setWidth?: (width: number) => void;
};
const TagsContext = createContext<TagsContextType>({
  value: undefined,
  setValue: undefined,
  open: false,
  onOpenChange: () => {
    // Default no-op function
  },
  width: undefined,
  setWidth: undefined,
});

const useTagsContext = () => {
  const context = useContext(TagsContext);
  if (!context) {
    throw new Error('useTagsContext must be used within a TagsProvider');
  }
  return context;
};

export type TagsProps = {
  value?: string;
  setValue?: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
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
    if (!ref.current) {
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
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
export type TagsTriggerProps = ComponentProps<typeof Button> & { testId?: string };
export const TagsTrigger = ({ className, children, testId, ...props }: TagsTriggerProps) => (
  <PopoverTrigger asChild>
    <Button
      className={cn(
        'h-auto w-full justify-between p-2 hover:bg-surface-inverse-hover active:bg-surface-default-hover',
        className
      )}
      data-testid={testId}
      role="combobox"
      variant="outline"
      {...props}
    >
      <div className="flex flex-wrap items-center gap-1">
        {children}
        <span className="px-2 py-px text-muted-foreground">Select a tag...</span>
      </div>
    </Button>
  </PopoverTrigger>
);
export type TagsValueProps = ComponentProps<'span'> & { testId?: string };
export const TagsValue = ({
  className,
  children,
  onRemove,
  testId,
  ...props
}: TagsValueProps & { onRemove?: () => void }) => {
  const handleRemove: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove?.();
  };
  return (
    <span
      className={cn(
        'm-0.5 inline-flex min-h-6 cursor-pointer items-center gap-1.5 rounded-md bg-surface-subtle px-2 py-1 font-medium text-sm text-strong transition-colors hover:bg-surface-strong',
        className
      )}
      data-testid={testId}
      {...props}
    >
      <span className="leading-tight">{children}</span>
      {onRemove ? (
        <button
          aria-label="Remove tag"
          className="size-auto cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-70"
          onClick={handleRemove}
          type="button"
        >
          <XIcon className="text-muted-foreground" size={12} />
        </button>
      ) : null}
    </span>
  );
};

export type TagsContentProps = ComponentProps<typeof PopoverContent>;
export const TagsContent = ({ className, children, ...props }: TagsContentProps) => {
  const { width } = useTagsContext();
  return (
    <PopoverContent className={cn('p-0', className)} style={{ width }} {...props}>
      <Command>{children}</Command>
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
  <CommandEmpty {...props}>{children ?? 'No tags found.'}</CommandEmpty>
);

export type TagsGroupProps = ComponentProps<typeof CommandGroup>;
export const TagsGroup = CommandGroup;

export type TagsItemProps = ComponentProps<typeof CommandItem>;
export const TagsItem = ({ className, ...props }: TagsItemProps) => (
  <CommandItem className={cn('cursor-pointer items-center justify-between', className)} {...props} />
);
