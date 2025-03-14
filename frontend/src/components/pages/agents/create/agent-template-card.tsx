import { Badge, Box, Card, CardBody, Flex, Text } from '@redpanda-data/ui';

interface AgentTemplateProps {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactElement;
  isSelected: boolean;
  isDisabled?: boolean;
  onClick: (id: string) => void;
}

export const AgentTemplateCard = ({
  id,
  title,
  subtitle,
  description,
  icon,
  isSelected,
  isDisabled = false,
  onClick,
}: AgentTemplateProps): JSX.Element => {
  const handleClick = (): void => {
    if (!isDisabled) {
      onClick(id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isDisabled) {
        onClick(id);
      }
    }
  };

  return (
    <Card
      width="324px"
      borderWidth={isSelected ? '2px' : '1px'}
      borderColor={isSelected ? 'rgba(22, 31, 46, 0.7)' : 'rgba(22, 31, 46, 0.3)'}
      borderRadius="8px"
      opacity={isDisabled ? 0.5 : 1}
      cursor={isDisabled ? 'not-allowed' : 'pointer'}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`Select ${title} connector`}
      _hover={!isDisabled ? { boxShadow: 'sm' } : {}}
    >
      <CardBody padding="16px 18px">
        <Flex direction="column" gap="6px">
          <Box mb="2">{icon}</Box>
          <Flex direction="column" gap="-1px">
            <Text fontSize="12px" fontWeight="600" lineHeight="1.4">
              {title}
            </Text>
            <Text fontSize="16px" fontWeight="600" lineHeight="1.3">
              {subtitle}
            </Text>
          </Flex>
          <Text fontSize="14px" lineHeight="1.4" color="rgba(0, 0, 0, 0.8)" noOfLines={3}>
            {description}
          </Text>
          <Badge alignSelf="flex-start" fontSize="12px" fontWeight="400" borderRadius="14px" padding="4px 8px">
            Documentation
          </Badge>
        </Flex>
      </CardBody>
    </Card>
  );
};
