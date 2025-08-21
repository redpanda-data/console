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
import { cn } from '../lib/utils';

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
  onOpenChange: () => {},
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
  testId?: string;
};

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
      <Popover open={open} onOpenChange={onOpenChange}>
        <div className={cn('relative w-full', className)} ref={ref} data-testid={testId}>
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
      variant="outline"
      role="combobox"
      className={cn('h-auto w-full justify-between p-2', className)}
      data-testid={testId}
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
  const handleRemove: MouseEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove?.();
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 cursor-pointer font-medium rounded-md text-sm px-2 py-1 bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 m-0.5 min-h-6',
        className,
      )}
      data-testid={testId}
      {...props}
    >
      <span className="leading-tight">{children}</span>
      {onRemove && (
        // biome-ignore lint/a11y/noStaticElementInteractions: part of tags component
        <div onClick={handleRemove} className="size-auto cursor-pointer hover:opacity-70 transition-opacity">
          <XIcon size={12} className="text-gray-600 dark:text-gray-300" />
        </div>
      )}
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
