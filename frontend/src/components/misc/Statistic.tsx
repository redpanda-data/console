import { Box, Flex, SpaceProps, Stat, StatLabel, StatNumber, Tooltip } from '@redpanda-data/ui';
import { MdInfoOutline } from 'react-icons/md';

export function Statistic(p: {
    key?: string | number,
    title: React.ReactNode,
    value: React.ReactNode,
    hint?: string,
    className?: string,
} & SpaceProps) {

    const { key, title, value, className, hint, ...rest } = p;

    return (
        <Stat key={key} className={className} flexBasis="auto" flexGrow={0} marginRight="2rem" {...rest}>
            <Flex gap={1}>
                <StatNumber>{value}</StatNumber>
                {hint && (
                    <Tooltip label={hint} hasArrow placement="right">
                        <Box alignSelf="start">
                            <MdInfoOutline />
                        </Box>
                    </Tooltip>
                )}
            </Flex>
            <StatLabel>{title}</StatLabel>
        </Stat>
    );

}
