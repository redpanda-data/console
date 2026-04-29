"use client";

import { Badge } from "components/redpanda-ui/components/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "components/redpanda-ui/components/collapsible";
import { CopyButton } from "components/redpanda-ui/components/copy-button";
import { Text } from "components/redpanda-ui/components/typography";
import { cn } from "components/redpanda-ui/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  LoaderIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { deepParseJson } from "utils/json-utils";
import { CodeBlock } from "./code-block";

/**
 * Union of static and dynamic tool UI parts.
 *
 * Static (typed) tools come from `UITools`; dynamic tools (e.g. provider-executed
 * MCP tools resolved at runtime) have `type: 'dynamic-tool'` and expose a
 * `toolName` field. Callers that handle MCP tools should accept `ToolPart`
 * rather than `ToolUIPart` to cover both shapes.
 */
export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("mb-4 w-full rounded-md border group", className)}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  className?: string;
  toolCallId?: string;
  durationMs?: number;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const getStatusBadge = (status: ToolPart["state"]) => {
  if (status === "output-available") {
    return (
      <Badge variant="success-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <CheckIcon className="size-4" />
          Completed
        </Text>
      </Badge>
    );
  }
  if (status === "input-available") {
    return (
      <Badge variant="info-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <LoaderIcon className="size-4 animate-spin" />
          Working
        </Text>
      </Badge>
    );
  }
  if (status === "output-error") {
    return (
      <Badge variant="destructive-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <XIcon className="size-4" />
          Error
        </Text>
      </Badge>
    );
  }
  if (status === "input-streaming") {
    return (
      <Badge variant="neutral-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <ClockIcon className="size-4" />
          Pending
        </Text>
      </Badge>
    );
  }
  if (status === "approval-requested") {
    return (
      <Badge variant="warning-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <ShieldAlertIcon className="size-4" />
          Awaiting Approval
        </Text>
      </Badge>
    );
  }
  if (status === "approval-responded") {
    return (
      <Badge variant="info-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          Responded
        </Text>
      </Badge>
    );
  }
  if (status === "output-denied") {
    return (
      <Badge variant="destructive-inverted" className="rounded-full">
        <Text variant="small" className="flex items-center gap-2">
          <XIcon className="size-4" />
          Denied
        </Text>
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
  toolCallId,
  durationMs,
  toolName,
  ...props
}: ToolHeaderProps) => {
  // For dynamic tools (e.g. MCP tools resolved at runtime), use the provided
  // `toolName` directly. For static tools the name is encoded in the part
  // `type`, e.g. `tool-get-weather` → `get-weather`.
  const derivedName =
    type === "dynamic-tool" ? (toolName ?? "") : type.split("-").slice(1).join("-");
  const displayName = title ?? derivedName;
  const textToCopy = toolCallId ? `${displayName} (${toolCallId})` : displayName;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <CollapsibleTrigger asChild>
      <div
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-4 p-3",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2">
          <WrenchIcon className="size-4 text-muted-foreground" />
          <Text as="span" variant="small" className="font-medium">
            {displayName}
          </Text>
          {getStatusBadge(state)}
          {durationMs !== undefined && (state === 'output-available' || state === 'output-error') && (
            <Text as="span" className="text-muted-foreground/50 text-[0.75rem]">
              {formatDuration(durationMs)}
            </Text>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolCallId && (
            <Text as="span" className="text-muted-foreground/50 text-[0.75rem] font-mono">
              {toolCallId}
            </Text>
          )}
          <CopyButton
            content={textToCopy}
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => e.stopPropagation()}
            title={toolCallId ? `Copy: ${displayName} (${toolCallId})` : `Copy: ${displayName}`}
          />
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </div>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "text-popover-foreground outline-none",
      className
    )}
    transition={{ duration: 0 }}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  // Don't render if input is undefined or an empty object
  if (!input || (typeof input === 'object' && input !== null && Object.keys(input).length === 0)) {
    return null;
  }

  // Parse nested JSON strings before displaying
  const parsedInput = deepParseJson(input);

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Parameters
      </h4>
      <div className="rounded-md bg-muted/50">
        <CodeBlock code={JSON.stringify(parsedInput, null, 2)} language="json" />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  // Don't render if there's no output/error or if output is an empty object
  const hasOutput = output !== undefined &&
    !(typeof output === 'object' && output !== null && !isValidElement(output) && Object.keys(output as object).length === 0);

  if (!(hasOutput || errorText)) {
    return null;
  }

  // Parse nested JSON strings before displaying
  const parsedOutput = deepParseJson(output);

  let Output = <div>{parsedOutput as ReactNode}</div>;

  if (typeof parsedOutput === "object" && !isValidElement(parsedOutput)) {
    Output = (
      <CodeBlock code={JSON.stringify(parsedOutput, null, 2)} language="json" />
    );
  } else if (typeof parsedOutput === "string") {
    Output = <CodeBlock code={parsedOutput} language="json" />;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div className={cn("rounded-md", errorText ? "bg-destructive/10" : "bg-muted/50")}>
        {errorText && <CodeBlock code={errorText} language="text" />}
        {hasOutput && Output}
      </div>
    </div>
  );
};
