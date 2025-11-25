import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "components/redpanda-ui/components/avatar";
import { cn } from "components/redpanda-ui/lib/utils";
import type { UIMessage } from "ai";
import { cva, type VariantProps } from "class-variance-authority";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "flex items-start gap-2 px-4 py-2",
      from === "user" ? "justify-end" : "justify-start",
      className
    )}
    {...props}
  />
);

const messageContentVariants = cva(
  "flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm",
  {
    variants: {
      variant: {
        contained: "",
        flat: "",
      },
    },
    defaultVariants: {
      variant: "contained",
    },
  }
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants>;

export const MessageContent = ({
  children,
  className,
  variant,
  ...props
}: MessageContentProps) => (
  <article
    className={cn(messageContentVariants({ variant, className }))}
    {...props}
  >
    {children}
  </article>
);

export type MessageBodyProps = HTMLAttributes<HTMLDivElement>;

export const MessageBody = ({
  children,
  className,
  ...props
}: MessageBodyProps) => (
  <div className={cn("p-4 space-y-4 text-sm leading-relaxed", className)} {...props}>
    {children}
  </div>
);

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar className={cn("size-8 ring-1 ring-border", className)} {...props}>
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2) || "ME"}</AvatarFallback>
  </Avatar>
);

export type MessageTimestampProps = HTMLAttributes<HTMLParagraphElement> & {
  from?: UIMessage["role"];
  timestamp?: Date | string;
};

export const MessageTimestamp = ({
  from,
  timestamp,
  className,
  ...props
}: MessageTimestampProps) => {
  const time = timestamp instanceof Date
    ? timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : timestamp;

  return (
    <p
      className={cn(
        "mt-2 text-xs",
        from === "user"
          ? "text-blue-100 dark:text-blue-200"
          : "text-slate-500 dark:text-slate-400",
        className
      )}
      {...props}
    >
      {time}
    </p>
  );
};

// Format token count with compact notation (e.g., "1.2K", "5.6M")
function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(tokens);
}

export type MessageMetadataProps = HTMLAttributes<HTMLDivElement> & {
  from?: UIMessage["role"];
  timestamp?: Date | string;
  messageId?: string;
  contextId?: string;
  taskId?: string;
  inputTokens?: number;
  outputTokens?: number;
};

export const MessageMetadata = ({
  from,
  timestamp,
  messageId,
  contextId,
  taskId,
  inputTokens,
  outputTokens,
  className,
  ...props
}: MessageMetadataProps) => {
  const time = timestamp instanceof Date
    ? timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
    : timestamp;

  const hasTokens = (inputTokens && inputTokens > 0) || (outputTokens && outputTokens > 0);

  // Don't render if no metadata to show
  const hasMetadata = contextId || taskId || messageId || hasTokens || time;
  if (!hasMetadata) return null;

  return (
    <div
      className={cn(
        "border-t bg-muted/30 px-4 py-2 text-muted-foreground text-xs",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-0.5">
        {from === "assistant" && (
          <>
            {contextId && (
              <div className="flex gap-1.5">
                <span className="font-medium">ctx:</span>
                <span className="font-mono">{contextId}</span>
              </div>
            )}
            {taskId && (
              <div className="flex gap-1.5">
                <span className="font-medium">task:</span>
                <span className="font-mono">{taskId}</span>
              </div>
            )}
            {messageId && (
              <div className="flex gap-1.5">
                <span className="font-medium">message_id:</span>
                <span className="font-mono">{messageId}</span>
              </div>
            )}
            {hasTokens && (
              <div className="flex items-center gap-1.5">
                <span className="font-medium">tokens:</span>
                <div className="flex items-center gap-2">
                  {inputTokens && inputTokens > 0 && (
                    <span className="flex items-center gap-1">
                      <ArrowUpIcon className="size-3" />
                      {formatTokenCount(inputTokens)}
                    </span>
                  )}
                  {outputTokens && outputTokens > 0 && (
                    <span className="flex items-center gap-1">
                      <ArrowDownIcon className="size-3" />
                      {formatTokenCount(outputTokens)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        {from === "user" && messageId && (
          <div className="flex gap-1.5">
            <span className="font-medium">message_id:</span>
            <span className="font-mono">{messageId}</span>
          </div>
        )}
        {time && (
          <div className="flex gap-1.5">
            <span className="font-medium">time:</span>
            <span>{time}</span>
          </div>
        )}
      </div>
    </div>
  );
};
