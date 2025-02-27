import { Text } from '@redpanda-data/ui';
import { Flex } from '@redpanda-data/ui';

export function SmallStat(p: {
  title: JSX.Element | string;
  children: JSX.Element | number | string;
}) {
  return (
    <Flex gap="2" color="#4A5568" fontFamily="Inter" fontWeight="400">
      <Text fontWeight="500">{p.title}: </Text>
      {p.children}
    </Flex>
  );
}
