import { Flex, IconButton } from '@redpanda-data/ui';
import type { FC, ReactElement } from 'react';
import { MdClose } from 'react-icons/md';

const RemovableFilter: FC<{ children: ReactElement; onRemove: () => void }> = ({ children, onRemove }) => (
  <Flex alignItems="center" border="1px solid" borderColor="gray.200" borderRadius="md">
    {children}
    <IconButton aria-label="Remove filter" icon={<MdClose size={18} />} onClick={() => onRemove()} variant="unstyled" />
  </Flex>
);

export default RemovableFilter;
