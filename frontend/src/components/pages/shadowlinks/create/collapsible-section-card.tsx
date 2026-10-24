import clsx from 'clsx';
import { ChevronDownIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardHeader } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import type React from 'react';

type CollapsibleSectionCardProps = {
  /** Card header content: a `CardTitle`, optionally with a description. */
  heading: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleLabel: string;
  toggleTestId: string;
  /** Card body, usually a `CardContent` holding a `CollapsibleContent`. */
  children: React.ReactNode;
};

/**
 * A full-width card whose header holds a chevron toggle for a `Collapsible`. The header and
 * body share one flex item, so the card's own gap doesn't open between them and a body
 * that is empty while collapsed leaves no trailing space.
 */
export const CollapsibleSectionCard = ({
  heading,
  open,
  onOpenChange,
  toggleLabel,
  toggleTestId,
  children,
}: CollapsibleSectionCardProps) => (
  <Collapsible onOpenChange={onOpenChange} open={open}>
    <Card size="full">
      <div>
        <CardHeader>
          {heading}
          <CardAction>
            <CollapsibleTrigger
              render={
                <Button aria-label={toggleLabel} data-testid={toggleTestId} size="icon-sm" variant="ghost">
                  <span
                    className={clsx('flex transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                  >
                    <ChevronDownIcon />
                  </span>
                </Button>
              }
            />
          </CardAction>
        </CardHeader>
        {children}
      </div>
    </Card>
  </Collapsible>
);
