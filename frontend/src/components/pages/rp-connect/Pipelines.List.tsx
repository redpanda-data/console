/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { CheckIcon } from '@chakra-ui/icons';
import { TrashIcon } from '@heroicons/react/outline';
import { Box, Button, createStandaloneToast, DataTable, Flex, Image, SearchField, Text } from '@redpanda-data/ui';
import { Button as NewButton } from 'components/redpanda-ui/components/button';
import { isFeatureFlagEnabled } from 'config';
import { useSessionStorage } from 'hooks/use-session-storage';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useCallback } from 'react';
import { FaRegStopCircle } from 'react-icons/fa';
import { HiX } from 'react-icons/hi';
import { MdOutlineQuestionMark, MdRefresh } from 'react-icons/md';
import { Link, useNavigate } from 'react-router-dom';
import { CONNECT_WIZARD_CONNECTOR_KEY, CONNECT_WIZARD_TOPIC_KEY, CONNECT_WIZARD_USER_KEY } from 'state/connect/state';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { appGlobal } from '../../../state/appGlobal';
import { pipelinesApi } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { openDeleteModal } from './modals';
import { ConnectTiles } from './onboarding/connect-tiles';
import type { ConnectComponentType } from './types/schema';
import type { AddTopicFormData, AddUserFormData, ConnectTilesFormData, WizardFormData } from './types/wizard';

const { ToastContainer, toast } = createStandaloneToast();

/**
 * Navigates to /rp-connect/create (legacy flow)
 */
const LegacyCreatePipelineButton = () => {
  return (
    <div>
      <NewButton as={Link} to="/rp-connect/create">
        Create pipeline
      </NewButton>
    </div>
  );
};

/**
 * Navigates to wizard and clears session storage
 */
const WizardCreatePipelineButton = () => {
  const [_, setPersistedConnectionName] = useSessionStorage<Partial<ConnectTilesFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {},
  );
  const [, setPersistedTopic] = useSessionStorage<Partial<AddTopicFormData>>(CONNECT_WIZARD_TOPIC_KEY, {});
  const [, setPersistedUser] = useSessionStorage<Partial<AddUserFormData>>(CONNECT_WIZARD_USER_KEY, {});
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    setPersistedConnectionName({});
    setPersistedTopic({});
    setPersistedUser({});
    navigate('/rp-connect/wizard');
  }, [setPersistedConnectionName, setPersistedTopic, setPersistedUser, navigate]);

  return (
    <div>
      <NewButton onClick={handleClick}>Create pipeline</NewButton>
    </div>
  );
};

/**
 * Shows image, text, and create button
 */
const LegacyEmptyState = () => {
  return (
    <Flex alignItems="center" justifyContent="center" flexDirection="column" gap="4" mb="4">
      <Image src={EmptyConnectors} />
      <Box>You have no Redpanda Connect pipelines.</Box>
      <LegacyCreatePipelineButton />
    </Flex>
  );
};

/**
 * Shows ConnectTiles and navigates to wizard with connector pre-selected
 */
const WizardEmptyState = () => {
  const [persistedConnectionName, setPersistedConnectionName] = useSessionStorage<Partial<WizardFormData>>(
    CONNECT_WIZARD_CONNECTOR_KEY,
    {},
  );
  const [, setPersistedTopic] = useSessionStorage<Partial<AddTopicFormData>>(CONNECT_WIZARD_TOPIC_KEY, {});
  const [, setPersistedUser] = useSessionStorage<Partial<AddUserFormData>>(CONNECT_WIZARD_USER_KEY, {});
  const navigate = useNavigate();

  const handleConnectionChange = useCallback(
    (connectionName: string, connectionType: ConnectComponentType) => {
      try {
        const existingOutput = persistedConnectionName.output;
        const newConfig = existingOutput
          ? { input: { connectionName, connectionType }, output: existingOutput }
          : { input: { connectionName, connectionType } };
        setPersistedConnectionName(newConfig);
        setPersistedTopic({});
        setPersistedUser({});
        navigate('/rp-connect/wizard?step=add-output');
      } catch (error) {
        toast({
          status: 'error',
          duration: 4000,
          isClosable: true,
          title: 'Failed to select connection',
          description: error instanceof Error ? error.message : 'Please try again',
        });
      }
    },
    [setPersistedConnectionName, setPersistedTopic, setPersistedUser, navigate, persistedConnectionName],
  );

  return (
    <ConnectTiles
      title="Send data to your pipeline"
      onChange={handleConnectionChange}
      componentTypeFilter={['input']}
      defaultConnectionName={persistedConnectionName.input?.connectionName}
      defaultConnectionType={persistedConnectionName.input?.connectionType}
      className="mt-4"
    />
  );
};

const EmptyPlaceholder = () => {
  const enableRpcnTiles = isFeatureFlagEnabled('enableRpcnTiles');
  return enableRpcnTiles ? <WizardEmptyState /> : <LegacyEmptyState />;
};

export const PipelineStatus = observer((p: { status: Pipeline_State }) => {
  switch (p.status) {
    case Pipeline_State.UNSPECIFIED:
      return (
        <Flex alignItems="center" gap="2">
          <HiX fontSize="17px" width="auto" color="orange" /> Unspecified
        </Flex>
      );
    case Pipeline_State.STARTING:
      return (
        <Flex alignItems="center" gap="2">
          <MdRefresh fontSize="17px" width="auto" color="#444" /> Starting
        </Flex>
      );
    case Pipeline_State.RUNNING:
      return (
        <Flex alignItems="center" gap="2">
          <CheckIcon fontSize="17px" width="auto" color="green" /> Running
        </Flex>
      );
    case Pipeline_State.COMPLETED:
      return (
        <Flex alignItems="center" gap="2">
          <CheckIcon fontSize="17px" width="auto" color="green" /> Completed
        </Flex>
      );
    case Pipeline_State.STOPPING:
      return (
        <Flex alignItems="center" gap="2">
          <MdRefresh fontSize="17px" width="auto" color="#444" /> Stopping
        </Flex>
      );
    case Pipeline_State.STOPPED:
      return (
        <Flex alignItems="center" gap="2">
          <FaRegStopCircle fontSize="17px" width="auto" color="#444" /> Stopped
        </Flex>
      );
    case Pipeline_State.ERROR:
      return (
        <Flex alignItems="center" gap="2">
          <HiX fontSize="17px" width="auto" color="red" /> Error
        </Flex>
      );
    default:
      return (
        <Flex alignItems="center" gap="2">
          <MdOutlineQuestionMark fontSize="17px" width="auto" color="red" /> Unknown
        </Flex>
      );
  }
});

export const PipelineThroughput = observer((p: { pipeline: Pipeline }) => {
  const { resources } = p.pipeline;
  if (!resources) return null;

  return (
    <>
      {resources.cpuShares} {resources.memoryShares}
    </>
  );
});

@observer
class RpConnectPipelinesList extends PageComponent<{}> {
  @observable placeholder = 5;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Redpanda Connect Pipelines', '/rp-connect');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    if (!Features.pipelinesApi) return;

    pipelinesApi.refreshPipelines(force).catch((err) => {
      if (String(err).includes('404')) {
        // Hacky special handling for OSS version, it is possible for the /endpoints request to not complete in time for this to render
        // so in this case there would be an error shown because we were too fast (with rendering, or the req was too slow)
        // We don't want to show an error in that case
        return;
      }

      if (Features.pipelinesApi) {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to load pipelines',
          description: String(err),
        });
      }
    });
  }

  render() {
    if (!pipelinesApi.pipelines) return DefaultSkeleton;

    const filteredPipelines = (pipelinesApi.pipelines ?? [])
      ?.filter((pipeline) => pipeline?.tags?.__redpanda_cloud_pipeline_type !== 'agent') // Ensure we do not show the agents
      .filter((u) => {
        const filter = uiSettings.pipelinesList.quickSearch;
        if (!filter) return true;
        try {
          const quickSearchRegExp = new RegExp(filter, 'i');
          if (u.id.match(quickSearchRegExp)) return true;
          if (u.displayName.match(quickSearchRegExp)) return true;
          return false;
        } catch {
          return false;
        }
      });

    return (
      <PageContent>
        <ToastContainer />
        {/* Pipeline List */}

        {pipelinesApi.pipelines.length !== 0 && isFeatureFlagEnabled('enableRpcnTiles') ? (
          <div className="my-5">
            <WizardCreatePipelineButton />
          </div>
        ) : pipelinesApi.pipelines.length !== 0 ? (
          <div className="flex flex-col gap-2 my-5">
            <LegacyCreatePipelineButton />
            <SearchField
              width="350px"
              searchText={uiSettings.pipelinesList.quickSearch}
              setSearchText={(x) => (uiSettings.pipelinesList.quickSearch = x)}
              placeholderText="Enter search term / regex..."
            />
          </div>
        ) : null}

        {(pipelinesApi.pipelines ?? []).length === 0 ? (
          <EmptyPlaceholder />
        ) : (
          <DataTable<Pipeline>
            data={filteredPipelines}
            pagination
            defaultPageSize={10}
            sorting
            columns={[
              {
                header: 'ID',
                cell: ({ row: { original } }) => (
                  <Link to={`/rp-connect/${encodeURIComponentPercents(original.id)}`}>
                    <Text>{original.id}</Text>
                  </Link>
                ),
                size: 100,
              },
              {
                header: 'Pipeline Name',
                cell: ({ row: { original } }) => (
                  <Link to={`/rp-connect/${encodeURIComponentPercents(original.id)}`}>
                    <Text wordBreak="break-word" whiteSpace="break-spaces">
                      {original.displayName}
                    </Text>
                  </Link>
                ),
                size: Number.POSITIVE_INFINITY,
              },
              {
                header: 'Description',
                accessorKey: 'description',
                cell: ({ row: { original } }) => (
                  <Text minWidth="200px" wordBreak="break-word" whiteSpace="break-spaces">
                    {original.description}
                  </Text>
                ),
                size: 200,
              },
              {
                header: 'State',
                cell: ({ row: { original } }) => {
                  return <PipelineStatus status={original.state} />;
                },
              },
              // {
              //     header: 'Throughput',
              //     cell: ({ row: { original } }) => {
              //         return <>
              //             <PipelineThroughput pipeline={original} />
              //         </>
              //     },
              //     size: 100,
              // },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original: r } }) => (
                  <Button
                    variant="icon"
                    height="16px"
                    color="gray.500"
                    // disabledReason={api.userData?.canDeleteTransforms === false ? 'You don\'t have the \'canDeleteTransforms\' permission' : undefined}
                    onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                      e.stopPropagation();
                      e.preventDefault();

                      openDeleteModal(r.displayName, () => {
                        pipelinesApi
                          .deletePipeline(r.id)
                          .then(async () => {
                            toast({
                              status: 'success',
                              duration: 4000,
                              isClosable: false,
                              title: 'Pipeline deleted',
                            });
                            pipelinesApi.refreshPipelines(true);
                          })
                          .catch((err) => {
                            toast({
                              status: 'error',
                              duration: null,
                              isClosable: true,
                              title: 'Failed to delete pipeline',
                              description: String(err),
                            });
                          });
                      });
                    }}
                  >
                    <TrashIcon />
                  </Button>
                ),
                size: 1,
              },
            ]}
            emptyText=""
          />
        )}
      </PageContent>
    );
  }
}

export default RpConnectPipelinesList;
