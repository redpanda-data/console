import { Flex, IconButton } from '@redpanda-data/ui';
import { CloseIcon } from 'components/icons';
import type { FC, ReactElement } from 'react';

const RemovableFilter: FC<{ children: ReactElement; onRemove: () => void }> = ({ children, onRemove }) => (
  <Flex alignItems="center" border="1px solid" borderColor="gray.200" borderRadius="md">
    {children}
    <IconButton
      aria-label="Remove filter"
      icon={<CloseIcon size={18} />}
      onClick={() => onRemove()}
      variant="unstyled"
    />
  </Flex>
);

export default RemovableFilter;
