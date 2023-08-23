
import { SpaceProps, Stat, StatLabel, StatNumber } from '@redpanda-data/ui';

export function Statistic(p: {
    key?: string | number,
    title: React.ReactNode,
    value: React.ReactNode,

    className?: string,
} & SpaceProps) {

    const { key, title, value, className, ...rest } = p;

    return <Stat key={key} className={className} flexBasis="auto" flexGrow={0} marginRight="2rem" {...rest}>
        <StatNumber>{value}</StatNumber>
        <StatLabel>{title}</StatLabel>
    </Stat>

}
