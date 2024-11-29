import { Flex, IconButton } from '@redpanda-data/ui';
import type { FC, ReactElement } from 'react';
import { MdClose } from 'react-icons/md';

const RemovableFilter: FC<{ children: ReactElement; onRemove: () => void }> = ({ children, onRemove }) => {
  return (
    <Flex border="1px solid" borderColor="gray.200" borderRadius="md" alignItems="center">
      {children}
      <IconButton
        icon={<MdClose size={18} />}
        onClick={() => onRemove()}
        variant="unstyled"
        aria-label="Remove filter"
      />
    </Flex>
  );
};

export default RemovableFilter;
