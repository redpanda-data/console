import { Flex, Text } from '@redpanda-data/ui';

export function SmallStat(p: { title: JSX.Element | string; children: JSX.Element | number | string }) {
  return (
    <Flex color="#4A5568" fontFamily="Inter" fontWeight="400" gap="2">
      <Text fontWeight="500">{p.title}: </Text>
      {p.children}
    </Flex>
  );
}
