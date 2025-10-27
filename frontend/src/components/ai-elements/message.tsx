import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "components/redpanda-ui/components/avatar";
import { cn } from "components/redpanda-ui/lib/utils";
import type { UIMessage } from "ai";
import { cva, type VariantProps } from "class-variance-authority";
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
  "max-w-[85%] rounded-xl shadow-sm overflow-hidden flex flex-col",
  {
    variants: {
      variant: {
        contained: "",
        flat: "",
      },
      from: {
        user: "bg-blue-500 text-white dark:bg-blue-600 dark:text-white",
        assistant: "border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
      },
    },
    defaultVariants: {
      variant: "contained",
      from: "assistant",
    },
  }
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof messageContentVariants> & {
    from?: UIMessage["role"];
  };

export const MessageContent = ({
  children,
  className,
  variant,
  from,
  ...props
}: MessageContentProps) => (
  <article
    aria-label={`${from || "message"}`}
    className={cn(messageContentVariants({ variant, from, className }))}
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

export type MessageMetadataProps = HTMLAttributes<HTMLDivElement> & {
  from?: UIMessage["role"];
  timestamp?: Date | string;
  messageId?: string;
  contextId?: string;
  taskId?: string;
};

export const MessageMetadata = ({
  from,
  timestamp,
  messageId,
  contextId,
  taskId,
  className,
  ...props
}: MessageMetadataProps) => {
  const time = timestamp instanceof Date
    ? timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : timestamp;

  // Don't render if no metadata to show
  const hasMetadata = contextId || taskId || messageId || time;
  if (!hasMetadata) return null;

  return (
    <div
      className={cn(
        "border-t px-3 py-1.5 text-[11px]",
        from === "user"
          ? "bg-blue-600/10 text-blue-100/80 dark:bg-blue-700/20 dark:text-blue-200/80"
          : "bg-muted/20 text-muted-foreground/80",
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
                <span className="font-medium">msg:</span>
                <span className="font-mono">{messageId}</span>
              </div>
            )}
          </>
        )}
        {from === "user" && messageId && (
          <div className="flex gap-1.5">
            <span className="font-medium">msg:</span>
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
