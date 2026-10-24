import type { ReactNode } from 'react';

import { Button } from '../../../redpanda-ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../../redpanda-ui/components/empty';

type SecurityEmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  /** Call to action shown next to the docs link; without one, neither is shown. */
  action?: ReactNode;
  docsHref: string;
};

export const SecurityEmptyState = ({ icon, title, description, action, docsHref }: SecurityEmptyStateProps) => (
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">{icon}</EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {Boolean(action) && (
      <EmptyContent>
        <div className="flex items-center gap-3">
          {action}
          <Button
            render={
              <a href={docsHref} rel="noopener noreferrer" target="_blank">
                Read the docs →
              </a>
            }
            variant="link"
          />
        </div>
      </EmptyContent>
    )}
  </Empty>
);
