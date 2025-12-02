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
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { useCallback } from 'react';
import { FaRegStopCircle } from 'react-icons/fa';
import { HiX } from 'react-icons/hi';
import { MdOutlineQuestionMark, MdRefresh } from 'react-icons/md';
import { Link, useNavigate } from 'react-router-dom';
import { useResetOnboardingWizardStore } from 'state/onboarding-wizard-store';

import { openDeleteModal } from './modals';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { appGlobal } from '../../../state/app-global';
import { pipelinesApi } from '../../../state/backend-api';
import { Features } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

const { ToastContainer, toast } = createStandaloneToast();

/**
 * Navigates to /rp-connect/create (legacy flow)
 */
const LegacyCreatePipelineButton = () => (
  <div>
    <NewButton as={Link} to="/rp-connect/create">
      Create pipeline
    </NewButton>
  </div>
);

/**
 * Navigates to wizard and clears session storage
 */
const WizardCreatePipelineButton = () => {
  const resetOnboardingWizardStore = useResetOnboardingWizardStore();
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    resetOnboardingWizardStore();
    navigate('/rp-connect/wizard');
  }, [resetOnboardingWizardStore, navigate]);

  return (
    <div>
      <NewButton onClick={handleClick}>Create pipeline</NewButton>
    </div>
  );
};

/**
 * Shows image, text, and create button
 */
const LegacyEmptyState = () => (
  <Flex alignItems="center" flexDirection="column" gap="4" justifyContent="center" mb="4">
    <Image src={EmptyConnectors} />
    <Box>You have no Redpanda Connect pipelines.</Box>
    {isFeatureFlagEnabled('enableRpcnTiles') ? <WizardCreatePipelineButton /> : <LegacyCreatePipelineButton />}
  </Flex>
);

export const PipelineStatus = observer((p: { status: Pipeline_State }) => {
  switch (p.status) {
    case Pipeline_State.UNSPECIFIED:
      return (
        <Flex alignItems="center" gap="2">
          <HiX color="orange" fontSize="17px" width="auto" /> Unspecified
        </Flex>
      );
    case Pipeline_State.STARTING:
      return (
        <Flex alignItems="center" gap="2">
          <MdRefresh color="#444" fontSize="17px" width="auto" /> Starting
        </Flex>
      );
    case Pipeline_State.RUNNING:
      return (
        <Flex alignItems="center" gap="2">
          <CheckIcon color="green" fontSize="17px" width="auto" /> Running
        </Flex>
      );
    case Pipeline_State.COMPLETED:
      return (
        <Flex alignItems="center" gap="2">
          <CheckIcon color="green" fontSize="17px" width="auto" /> Completed
        </Flex>
      );
    case Pipeline_State.STOPPING:
      return (
        <Flex alignItems="center" gap="2">
          <MdRefresh color="#444" fontSize="17px" width="auto" /> Stopping
        </Flex>
      );
    case Pipeline_State.STOPPED:
      return (
        <Flex alignItems="center" gap="2">
          <FaRegStopCircle color="#444" fontSize="17px" width="auto" /> Stopped
        </Flex>
      );
    case Pipeline_State.ERROR:
      return (
        <Flex alignItems="center" gap="2">
          <HiX color="red" fontSize="17px" width="auto" /> Error
        </Flex>
      );
    default:
      return (
        <Flex alignItems="center" gap="2">
          <MdOutlineQuestionMark color="red" fontSize="17px" width="auto" /> Unknown
        </Flex>
      );
  }
});

export const PipelineThroughput = observer((p: { pipeline: Pipeline }) => {
  const { resources } = p.pipeline;
  if (!resources) {
    return null;
  }

  return (
    <>
      {resources.cpuShares} {resources.memoryShares}
    </>
  );
});

@observer
// biome-ignore lint/complexity/noBannedTypes: empty object represents pages with no route params
class RpConnectPipelinesList extends PageComponent<{}> {
  @observable placeholder = 5;

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Redpanda Connect Pipelines', '/rp-connect');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    if (!Features.pipelinesApi) {
      return;
    }

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
    if (!pipelinesApi.pipelines) {
      return DefaultSkeleton;
    }

    const filteredPipelines = (pipelinesApi.pipelines ?? [])
      ?.filter((pipeline) => pipeline?.tags?.__redpanda_cloud_pipeline_type !== 'agent') // Ensure we do not show the agents
      .filter((u) => {
        const filter = uiSettings.pipelinesList.quickSearch;
        if (!filter) {
          return true;
        }
        try {
          const quickSearchRegExp = new RegExp(filter, 'i');
          if (u.id.match(quickSearchRegExp)) {
            return true;
          }
          if (u.displayName.match(quickSearchRegExp)) {
            return true;
          }
          return false;
        } catch {
          return false;
        }
      });

    return (
      <PageContent>
        <ToastContainer />
        {/* Pipeline List */}

        {pipelinesApi.pipelines.length !== 0 &&
          (isFeatureFlagEnabled('enableRpcnTiles') ? (
            <div className="my-5">
              <WizardCreatePipelineButton />
            </div>
          ) : (
            <div className="my-5 flex flex-col gap-2">
              <LegacyCreatePipelineButton />
              <SearchField
                placeholderText="Enter search term / regex..."
                searchText={uiSettings.pipelinesList.quickSearch}
                setSearchText={(x) => (uiSettings.pipelinesList.quickSearch = x)}
                width="350px"
              />
            </div>
          ))}

        {(pipelinesApi.pipelines ?? []).length === 0 ? (
          <LegacyEmptyState />
        ) : (
          <DataTable<Pipeline>
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
                    <Text whiteSpace="break-spaces" wordBreak="break-word">
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
                  <Text minWidth="200px" whiteSpace="break-spaces" wordBreak="break-word">
                    {original.description}
                  </Text>
                ),
                size: 200,
              },
              {
                header: 'State',
                cell: ({ row: { original } }) => <PipelineStatus status={original.state} />,
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
                    color="gray.500"
                    height="16px"
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
                            await pipelinesApi.refreshPipelines(true);
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
                    // disabledReason={api.userData?.canDeleteTransforms === false ? 'You don\'t have the \'canDeleteTransforms\' permission' : undefined}
                    variant="icon"
                  >
                    <TrashIcon />
                  </Button>
                ),
                size: 1,
              },
            ]}
            data={filteredPipelines}
            defaultPageSize={10}
            emptyText=""
            pagination
            sorting
          />
        )}
      </PageContent>
    );
  }
}

export default RpConnectPipelinesList;
