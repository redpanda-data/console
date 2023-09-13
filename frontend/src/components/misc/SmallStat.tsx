import { Flex } from '@redpanda-data/ui';
import { Text } from '@chakra-ui/react';

export function SmallStat(p: {
    title: JSX.Element | string,
    children: JSX.Element | number | string,
}) {
    return <Flex gap="2" color="#4A5568" fontFamily="Inter" fontWeight="400">
        <Text fontWeight="500">{p.title}: </Text>
        {p.children}
    </Flex>
}
