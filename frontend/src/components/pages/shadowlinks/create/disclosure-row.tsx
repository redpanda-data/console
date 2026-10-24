import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronRightIcon } from 'components/icons';
import { TonedIcon } from 'components/pages/shared/toned-icon';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { cn } from 'components/redpanda-ui/lib/utils';
import type React from 'react';

const disclosurePanelVariants = cva('', {
  variants: {
    panel: {
      // An inset, outlined well for an optional group of fields.
      inset: 'rounded-md border bg-muted/30 p-4',
      // Fields laid straight under the trigger, aligned with its label.
      plain: 'flex flex-col gap-4',
    },
  },
  defaultVariants: {
    panel: 'inset',
  },
});

type DisclosureRowProps = VariantProps<typeof disclosurePanelVariants> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  description: React.ReactNode;
  /** Shown beside the label while the row is closed. */
  badge?: React.ReactNode;
  testId: string;
  triggerTestId: string;
  children: React.ReactNode;
};

/** A chevron row with a label and description that discloses an optional group of fields. */
export const DisclosureRow = ({
  open,
  onOpenChange,
  label,
  description,
  badge,
  panel,
  testId,
  triggerTestId,
  children,
}: DisclosureRowProps) => (
  <Collapsible onOpenChange={onOpenChange} open={open} testId={testId}>
    <CollapsibleTrigger
      render={
        <button
          className="-mx-2 flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
          data-testid={triggerTestId}
          type="button"
        >
          <span
            className={cn('mt-1 flex shrink-0 transition-transform motion-reduce:transition-none', open && 'rotate-90')}
          >
            <TonedIcon className="h-4 w-4" icon={ChevronRightIcon} tone="muted" />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-body font-medium">{label}</span>
              {!open && badge}
            </div>
            <div className="mt-0.5 text-body-sm text-muted-foreground">{description}</div>
          </div>
        </button>
      }
    />
    <CollapsibleContent className="mt-2 ml-6">
      <div className={disclosurePanelVariants({ panel })}>{children}</div>
    </CollapsibleContent>
  </Collapsible>
);
