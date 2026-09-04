import { CloseIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import type { FC, ReactElement } from 'react';

const RemovableFilter: FC<{ children: ReactElement; onRemove: () => void }> = ({ children, onRemove }) => (
  <div className="!border-border flex items-center rounded-md border">
    {children}
    <Button aria-label="Remove filter" onClick={() => onRemove()} size="icon-sm" variant="ghost">
      <CloseIcon size={18} />
    </Button>
  </div>
);

export default RemovableFilter;
