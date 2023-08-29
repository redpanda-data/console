import { Flex } from '@redpanda-data/ui';
import { Text } from '@chakra-ui/react';

export function SmallStat(p: {
    title: JSX.Element | string,
    children: JSX.Element | number | string,
}) {
    return <Flex gap="2">
        <Text fontWeight="bold">{p.title}: </Text>
        {p.children}
    </Flex>
}
