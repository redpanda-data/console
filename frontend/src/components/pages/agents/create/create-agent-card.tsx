import { Box, Card, Stack, Text, useColorModeValue } from '@redpanda-data/ui';
import type { ReactNode } from 'react';

interface CreateAgentCardProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  isSelected?: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
  url?: string;
}

export const CreateAgentCard = ({
  icon,
  title,
  subtitle,
  description,
  isSelected = false,
  isDisabled,
  onSelect,
  url,
}: CreateAgentCardProps) => {
  const handleClick = () => {
    if (!isDisabled) {
      onSelect();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isDisabled) {
        onSelect();
      }
    }
  };

  const borderColor = useColorModeValue(
    isSelected ? 'rgba(22, 31, 46, 0.7)' : 'rgba(22, 31, 46, 0.3)',
    isSelected ? 'whiteAlpha.700' : 'whiteAlpha.300',
  );

  const borderWidth = isSelected ? '2px' : '1px';

  return (
    <Card
      variant="outline"
      borderColor={borderColor}
      borderWidth={borderWidth}
      p={4}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
      aria-disabled={isDisabled}
      height="100%"
      transition="all 0.2s"
      _hover={{
        transform: isDisabled ? 'none' : 'translateY(-2px)',
        boxShadow: isDisabled ? 'none' : 'md',
      }}
      opacity={isDisabled ? 0.6 : 1}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
    >
      <Stack spacing={2} height="100%">
        <Box width="32px" height="32px">
          {icon}
        </Box>
        <Text fontWeight="600" fontSize="12px" color="black">
          {title}
        </Text>
        <Text fontWeight="600" fontSize="16px" color="black" lineHeight="1.3">
          {subtitle}
        </Text>
        <Text fontSize="14px" color="rgba(0, 0, 0, 0.8)" noOfLines={3} flex="1" lineHeight="1.4">
          {description}
        </Text>
        {url && (
          <Box
            as="a"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            fontSize="12px"
            fontWeight="400"
            py="4px"
            px="8px"
            borderRadius="14px"
            bg="rgba(22, 31, 46, 0.08)"
            color="black"
            alignSelf="flex-start"
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
            _hover={{
              textDecoration: 'none',
              bg: 'rgba(22, 31, 46, 0.12)',
            }}
          >
            Documentation
          </Box>
        )}
      </Stack>
    </Card>
  );
};
