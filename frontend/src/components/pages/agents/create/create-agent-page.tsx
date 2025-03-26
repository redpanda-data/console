import {
  Box,
  Button,
  ButtonGroup,
  Flex,
  Grid,
  Heading,
  Icon,
  Text,
  VStack,
  useColorModeValue,
} from '@redpanda-data/ui';
import { runInAction } from 'mobx';
import { type ReactNode, useState } from 'react';
import { AiOutlineSlack } from 'react-icons/ai';
import { MdNewspaper } from 'react-icons/md';
import { useHistory } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { CreateAgentCard } from './create-agent-card';

interface AgentOption {
  type: 'http' | 'slack';
  icon: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  url?: string;
  isSelected?: boolean;
  isDisabled?: boolean;
}

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'Agents', linkTo: '/agents', heading: 'Agents' });
  });
};

export const CreateAgentPage = () => {
  const history = useHistory();

  const templateListData: AgentOption[] = [
    {
      type: 'http',
      icon: <Icon as={MdNewspaper} width={8} height={8} />,
      title: 'New web request',
      subtitle: 'HTTP Server',
      description: 'Description',
      isSelected: true, // hardcoded as we only have 1 template for now
    },
    {
      type: 'slack',
      icon: <Icon as={AiOutlineSlack} width={8} height={8} />,
      title: 'New event in Slack',
      subtitle: 'Slack',
      description: 'Description',
      isDisabled: true,
    },
  ];

  const textColor = useColorModeValue('rgba(0, 0, 0, 0.8)', 'rgba(255, 255, 255, 0.8)');

  return (
    <Flex direction="column" gap={{ base: '20px', md: '30px' }} w="full">
      <VStack align="flex-start" spacing="12px" px={{ base: 4, md: 0 }}>
        <Heading as="h1" fontSize={{ base: '20px', md: '24px' }} fontWeight={600} lineHeight="1em">
          Create an AI Agent
        </Heading>
        <Text fontSize={{ base: '14px', md: '14px' }} lineHeight="1.4em" color={textColor}>
          AI agents description lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam blandit, augue at posuere
          pharetra, turpis tellus porttitor leo, ac luctus libero dui et turpis.
        </Text>
      </VStack>

      <Box w="full" px={{ base: 4, md: 0 }}>
        <Grid
          templateColumns={{
            base: '1fr',
            md: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
          }}
          gap={{ base: '12px', md: '20px' }}
          maxW="1012px"
        >
          {templateListData.map((agent) => (
            <CreateAgentCard
              key={agent.type}
              icon={agent.icon}
              title={agent.title}
              subtitle={agent.subtitle}
              description={agent.description}
              url={agent.url}
              isSelected={agent.isSelected}
              isDisabled={agent.isDisabled}
              onSelect={() => {
                history.push(`/agents/create/${agent.type}`);
              }}
            />
          ))}
        </Grid>
      </Box>
    </Flex>
  );
};
