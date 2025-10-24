"use client";

import { Badge } from "components/redpanda-ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "components/redpanda-ui/components/collapsible";
import { Text } from "components/redpanda-ui/components/typography";
import { cn } from "components/redpanda-ui/lib/utils";
import type { ToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  LoaderIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("mb-4 w-full rounded-md border", className)}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  type: ToolUIPart["type"];
  state: ToolUIPart["state"];
  className?: string;
};

const getStatusBadge = (status: ToolUIPart["state"]) => {
  if (status === "output-available") {
    return (
      <Badge variant="green" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2"><CheckIcon className="size-4" />Completed</Text>
      </Badge>
    );
  }
  if (status === "input-available") {
    return (
      <Badge variant="blue" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2"><LoaderIcon className="size-4 animate-spin" />Running</Text>
      </Badge>
    );
  }
  if (status === "output-error") {
    return (
      <Badge variant="red" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2"><XIcon className="size-4" />Error</Text>
      </Badge>
    );
  }
  if (status === "input-streaming") {
    return (
      <Badge variant="gray" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2"><ClockIcon className="size-4" />Pending</Text>
      </Badge>
    );
  }
  return null;
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-4 p-3",
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-2">
      <WrenchIcon className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">
        {title ?? type.split("-").slice(1).join("-")}
      </span>
      {getStatusBadge(state)}
    </div>
    <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  // Don't render if input is undefined or an empty object
  if (!input || (typeof input === 'object' && Object.keys(input).length === 0)) {
    return null;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Parameters
      </h4>
      <div className="rounded-md bg-muted/50">
        <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolUIPart["output"];
  errorText: ToolUIPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  // Don't render if there's no output/error or if output is an empty object
  const hasOutput = output !== undefined &&
    !(typeof output === 'object' && !isValidElement(output) && Object.keys(output as object).length === 0);

  if (!(hasOutput || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div className="break-words p-3">{errorText}</div>}
        {hasOutput && Output}
      </div>
    </div>
  );
};
