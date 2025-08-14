import { create } from '@bufbuild/protobuf';
import { cx } from '@emotion/css';
import {
  Button,
  ButtonGroup,
  Link as ChakraLink,
  DataTable,
  Empty,
  Flex,
  HStack,
  Icon,
  SearchField,
  Spinner,
  Stack,
  Text,
  useDisclosure,
} from '@redpanda-data/ui';
import ErrorResult from 'components/misc/ErrorResult';
import type { IRouteEntry } from 'components/routes';
import { config } from 'config';
import { useBooleanFlagValue } from 'custom-feature-flag-provider';
import { type JwtPayload, jwtDecode } from 'jwt-decode';
import { runInAction } from 'mobx';
import { ListPipelinesRequestSchema as ListPipelinesRequestSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { type ReactNode, useEffect, useState } from 'react';
import { AiOutlineDelete } from 'react-icons/ai';
import { useListAgentsQuery } from 'react-query/api/agent';
import { Link as ReactRouterLink, useNavigate } from 'react-router-dom';
import { uiState } from 'state/uiState';
import { SidebarItemBadge } from '../../misc/sidebar-item-badge';
import { DeleteAgentModal } from './delete-agent-modal';
import { AgentStateDisplayValue } from './details/agent-state-display-value';
import { HUBSPOT_AI_AGENTS_FORM_ID, HUBSPOT_PORTAL_ID, HUBSPOT_REGION } from './hubspot.helper';
import HubspotModal from './hubspot-modal';
import { buttonCss, errorCss, errorMessageCss } from './hubspot-styles';


export interface TokenPayload extends JwtPayload {
  'https://cloud.redpanda.com/client_organization_id': string;
  'https://cloud.redpanda.com/user_type': string;
  'https://cloud.redpanda.com/email': string;
  'https://cloud.redpanda.com/organization_id': string;
  'https://cloud.redpanda.com/first_login': boolean;
  'https://cloud.redpanda.com/account_id'?: string;
  scope: string;
  org_id: string;
  permissions: string[];
}

export const AI_AGENTS_SUMMARY = `AI Agents are autonomous, general-purpose assistants that combine language understanding with the ability to
take action. You can enrich them with your own proprietary data, connect them to tools, and let them reason
through complex problems — iterating toward the best solution.`;

interface AgentSidebarItemTitleProps {
  route: IRouteEntry;
}

export const getAgentSidebarItemTitle = ({ route }: AgentSidebarItemTitleProps) => (
  <HStack spacing="12px" key={`${route.path}-title`}>
    <Text>{route.title}</Text>
    <SidebarItemBadge>beta</SidebarItemBadge>
  </HStack>
);

// Hack for MobX to ensure we don't need to use observables
export const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Agents';
    uiState.pageBreadcrumbs.pop(); // Remove last breadcrumb to ensure the agent title is used without previous page breadcrumb being shown
    uiState.pageBreadcrumbs.push({ title: 'AI Agents', linkTo: '/agents', heading: 'AI Agents' });
  });
};

interface CellLinkProps {
  agentId: string;
  children: ReactNode;
}

/**
 * @description Workaround because DataTable does not let us mark the whole row as a link
 * @see https://tanstack.com/table/v8/docs/guide/row-selection for proper implementation
 * TODO: Remove this and use @tanstack/react-table properly, for example use div instead of span to wrap the text
 *
 */
const CellLink = ({ agentId, children }: CellLinkProps) => (
  <ChakraLink
    as={ReactRouterLink}
    to={`/agents/${agentId}`}
    textDecoration="none"
    _hover={{
      textDecoration: 'none',
    }}
    width="100%"
    display="block"
  >
    {children}
  </ChakraLink>
);

export const AgentListPage = () => {
  const [isHubspotAIAgentsModalOpen, setIsHubspotAIAgentsModalOpen] = useState(false);
  const [isHubspotAIAgentsFormSubmitted, setIsHubspotAIAgentsFormSubmitted] = useState(false);

  const isAiAgentsPreviewEnabled = useBooleanFlagValue('enableAiAgentsInConsoleUiPreview');
  const navigate = useNavigate();

  const [nameContains, setNameContains] = useState('');

  const [deleteAgentId, setDeleteAgentId] = useState<string>('');

  const {
    isOpen: isDeleteAgentModalOpen,
    onOpen: onDeleteAgentModalOpen,
    onClose: onDeleteAgentModalClose,
  } = useDisclosure();
  const {
    data: agentList,
    isLoading: isAgentListLoading,
    isError: isAgentListError,
    error: agentListError,
  } = useListAgentsQuery(
    create(ListPipelinesRequestSchemaDataPlane, {
      filter: {
        nameContains,
      },
    }),
  );

  useEffect(() => {
    updatePageTitle();
  }, []);

  const handleDeleteAgentModal = (agentId: string) => {
    setDeleteAgentId(agentId);
    onDeleteAgentModalOpen();
  };

  const handleRequestAccess = async () => {
    /**
     * @see https://legacydocs.hubspot.com/docs/methods/forms/advanced_form_options
     */
    // Need to cast as any because otherwise we would need to declare a custom global window TS interface.
    await (window as any)?.hbspt?.forms.create({
      region: HUBSPOT_REGION,
      portalId: HUBSPOT_PORTAL_ID,
      formId: HUBSPOT_AI_AGENTS_FORM_ID,
      target: '#hubspot-modal',
      submitButtonClass: `chakra-button ${cx(buttonCss)}`,
      errorClass: cx(errorCss),
      errorMessageClass: cx(errorMessageCss),
      onFormReady: () => {
        if (config.jwt) {
          const decoded = jwtDecode<TokenPayload>(config.jwt);

          const emailInput = document.getElementById(`email-${HUBSPOT_AI_AGENTS_FORM_ID}`) as HTMLInputElement | null;
          const firstNameInput = document.getElementById(
            `firstname-${HUBSPOT_AI_AGENTS_FORM_ID}`,
          ) as HTMLInputElement | null;

          if (emailInput) {
            emailInput.value = decoded?.['https://cloud.redpanda.com/email'];

            /**
             * This is a hack to ensure all browsers follow the same behavior.
             * In some cases, the input's new value gets defered despite being set.
             * It means it can only be submitted after the field has already been touched.
             * We focus on the email field so that it does not have to be touched anymore.
             */
            emailInput.focus();
            if (firstNameInput) {
              firstNameInput.focus();
            } else {
              emailInput.blur();
            }
          }
        }
      },
      onFormSubmitted: () => {
        setIsHubspotAIAgentsFormSubmitted(true);
      },
    });

    setIsHubspotAIAgentsModalOpen(true);
  };

  if (isAgentListError) {
    return <ErrorResult error={agentListError} title="Error loading agents" message="Please try again later." />;
  }

  if (!isAiAgentsPreviewEnabled) {
    return (
      <>
        <Stack spacing={4}>
          <Text>{AI_AGENTS_SUMMARY}</Text>
          <ButtonGroup>
            <Button variant="outline" onClick={handleRequestAccess} data-testid="create-agent-button">
              {isAiAgentsPreviewEnabled ? 'Create agent' : 'Request access'}
            </Button>
          </ButtonGroup>
        </Stack>
        <HubspotModal
          isOpen={isHubspotAIAgentsModalOpen}
          isSubmitted={isHubspotAIAgentsFormSubmitted}
          onClose={() => setIsHubspotAIAgentsModalOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>{AI_AGENTS_SUMMARY}</Text>
          <ButtonGroup>
            <Button
              variant="outline"
              onClick={() => {
                navigate('/agents/create');
              }}
              data-testid="create-agent-button"
            >
              Create agent
            </Button>
          </ButtonGroup>
        </Stack>

        <SearchField
          width="350px"
          searchText={nameContains}
          setSearchText={setNameContains}
          placeholderText="Filter agents..."
        />

        {isAgentListLoading ? (
          <Flex justifyContent="center" padding={8}>
            <Spinner size="lg" />
          </Flex>
        ) : agentList?.agents?.length === 0 ? (
          <Empty />
        ) : (
          <DataTable
            data={agentList?.agents ?? []}
            pagination
            defaultPageSize={10}
            sorting
            columns={[
              {
                header: 'Name',
                cell: ({ row: { original } }) => (
                  <CellLink agentId={original?.id ?? ''}>
                    <Text data-testid={`agent-name-${original?.id}`}>{original?.displayName}</Text>
                  </CellLink>
                ),
              },
              {
                header: 'Status',
                id: 'status',
                cell: ({ row: { original } }) => (
                  <CellLink agentId={original?.id ?? ''}>
                    <AgentStateDisplayValue state={original?.state} />
                  </CellLink>
                ),
              },
              {
                header: 'Description',
                cell: ({ row: { original } }) => (
                  <CellLink agentId={original?.id ?? ''}>
                    <Text data-testid={`agent-description-${original?.id}`}>{original?.description}</Text>
                  </CellLink>
                ),
              },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original } }) => (
                  <HStack spacing={4} justifyContent="flex-end">
                    <Icon
                      data-testid={`delete-agent-${original?.id}`}
                      as={AiOutlineDelete}
                      onClick={() => handleDeleteAgentModal(original?.id ?? '')}
                      cursor="pointer"
                      aria-label="Delete agent"
                    />
                  </HStack>
                ),
              },
            ]}
          />
        )}
      </Stack>
      <DeleteAgentModal
        isOpen={isDeleteAgentModalOpen}
        onClose={onDeleteAgentModalClose}
        agent={agentList?.agents?.find((agent) => agent?.id === deleteAgentId)}
      />
    </>
  );
};
