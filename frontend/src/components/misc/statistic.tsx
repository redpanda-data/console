import { Box, Flex, type SpaceProps, Stat, StatLabel, StatNumber, Tooltip } from '@redpanda-data/ui';
import { InfoIcon } from 'components/icons';

export function Statistic(
  p: {
    key?: string | number;
    title: React.ReactNode;
    value: React.ReactNode;
    hint?: string;
    className?: string;
  } & SpaceProps
) {
  const { key, title, value, className, hint, ...rest } = p;

  return (
    <Stat className={className} flexBasis="auto" flexGrow={0} key={key} marginRight="2rem" {...rest}>
      <StatNumber>{value}</StatNumber>
      <StatLabel>
        <Flex gap={1}>
          {title}
          {Boolean(hint) && (
            <Tooltip hasArrow label={hint} placement="right">
              <Box alignSelf="start">
                <InfoIcon size={18} />
              </Box>
            </Tooltip>
          )}
        </Flex>
      </StatLabel>
    </Stat>
  );
}
