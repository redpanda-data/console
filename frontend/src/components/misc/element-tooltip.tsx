import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { cloneElement, type ReactElement, type ReactNode, useId, useState } from 'react';

type DescribableElement = ReactElement<{ 'aria-describedby'?: string; 'aria-label'?: string; testId?: string }>;

/** Registry tooltip on `children` itself (no wrapper element); renders `children` alone when `content` is empty. */
export function ElementTooltip({ children, content }: { children: DescribableElement; content: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (content === null || content === undefined || content === '' || content === false) {
    return children;
  }
  const describes = open && content !== children.props['aria-label'];
  const description =
    [children.props['aria-describedby'], describes ? id : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <Tooltip
      onOpenChange={(nextOpen, details) => {
        if (details.reason === 'escape-key') {
          details.allowPropagation();
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <TooltipTrigger
        render={cloneElement(children, { 'aria-describedby': description })}
        testId={children.props.testId}
      />
      <TooltipContent id={id} role="tooltip">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
