"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "components/redpanda-ui/components/collapsible";
import { Badge } from "components/redpanda-ui/components/badge";
import { Text } from "components/redpanda-ui/components/typography";
import { cn } from "components/redpanda-ui/lib/utils";
import { ChevronDownIcon, SearchIcon, CheckIcon, LoaderIcon, XIcon, ClockIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type TaskItemFileProps = ComponentProps<"div">;

export const TaskItemFile = ({
  children,
  className,
  ...props
}: TaskItemFileProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-foreground text-xs",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type TaskItemProps = ComponentProps<"div">;

export const TaskItem = ({ children, className, ...props }: TaskItemProps) => (
  <div className={cn("text-muted-foreground text-sm", className)} {...props}>
    {children}
  </div>
);

export type TaskProps = ComponentProps<typeof Collapsible>;

export const Task = ({
  defaultOpen = true,
  className,
  ...props
}: TaskProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title: string;
};

export const TaskTrigger = ({
  children,
  className,
  title,
  ...props
}: TaskTriggerProps) => (
  <CollapsibleTrigger className={cn("group", className)} {...props}>
    {children ?? (
      <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
        <SearchIcon className="size-4" />
        <p className="text-sm">{title}</p>
        <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
      </div>
    )}
  </CollapsibleTrigger>
);

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export const TaskContent = ({
  children,
  className,
  ...props
}: TaskContentProps) => (
  <CollapsibleContent
    className={cn(
      "text-popover-foreground outline-none",
      className
    )}
    layout={false}
    transition={{ duration: 0 }}
    {...props}
  >
    <div className="mt-4 space-y-2 border-muted border-l-2 pl-4">
      {children}
    </div>
  </CollapsibleContent>
);

export type TaskStateProps = {
  state: 'submitted' | 'working' | 'input-required' | 'completed' | 'canceled' | 'failed' | 'rejected' | 'auth-required' | 'unknown';
};

export const TaskState = ({ state }: TaskStateProps) => {
  switch (state) {
    case 'completed':
      return (
        <Badge variant="green" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <CheckIcon className="size-4" />
            Completed
          </Text>
        </Badge>
      );

    case 'working':
      return (
        <Badge variant="blue" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <LoaderIcon className="size-4 animate-spin" />
            Working
          </Text>
        </Badge>
      );

    case 'failed':
    case 'rejected':
      return (
        <Badge variant="red" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <XIcon className="size-4" />
            Failed
          </Text>
        </Badge>
      );

    case 'submitted':
      return (
        <Badge variant="gray" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Submitted
          </Text>
        </Badge>
      );

    case 'input-required':
      return (
        <Badge variant="yellow" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Input Required
          </Text>
        </Badge>
      );

    case 'canceled':
      return (
        <Badge variant="gray" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <XIcon className="size-4" />
            Canceled
          </Text>
        </Badge>
      );

    case 'auth-required':
      return (
        <Badge variant="yellow" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Auth Required
          </Text>
        </Badge>
      );

    case 'unknown':
      return (
        <Badge variant="gray" className="rounded-full">
          <Text variant="small" className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            Unknown
          </Text>
        </Badge>
      );

    default:
      return null;
  }
};
