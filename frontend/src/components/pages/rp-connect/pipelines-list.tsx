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

import { Box, Button, createStandaloneToast, DataTable, Flex, Image, SearchField, Text } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { CheckIcon, CloseIcon, HelpIcon, RotateCwIcon, StopCircleIcon, TrashIcon } from 'components/icons';
import { Button as NewButton } from 'components/redpanda-ui/components/button';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';

import { openDeleteModal } from './modals';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import { type Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { appGlobal } from '../../../state/app-global';
import { pipelinesApi } from '../../../state/backend-api';
import { Features } from '../../../state/supported-features';
import { uiSettings } from '../../../state/ui';
import { getSearchRegex } from '../../../utils/regex';
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
 * Shows image, text, and create button
 */
const LegacyEmptyState = () => (
  <Flex alignItems="center" flexDirection="column" gap="4" justifyContent="center" mb="4">
    <Image src={EmptyConnectors} />
    <Box>You have no Redpanda Connect pipelines.</Box>
    <LegacyCreatePipelineButton />
  </Flex>
);

export const PipelineStatus = observer((p: { status: Pipeline_State }) => {
  switch (p.status) {
    case Pipeline_State.UNSPECIFIED:
      return (
        <Flex alignItems="center" gap="2">
          <CloseIcon color="orange" fontSize="17px" width="auto" /> Unspecified
        </Flex>
      );
    case Pipeline_State.STARTING:
      return (
        <Flex alignItems="center" gap="2">
          <RotateCwIcon color="#444" fontSize="17px" width="auto" /> Starting
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
          <RotateCwIcon color="#444" fontSize="17px" width="auto" /> Stopping
        </Flex>
      );
    case Pipeline_State.STOPPED:
      return (
        <Flex alignItems="center" gap="2">
          <StopCircleIcon color="#444" fontSize="17px" width="auto" /> Stopped
        </Flex>
      );
    case Pipeline_State.ERROR:
      return (
        <Flex alignItems="center" gap="2">
          <CloseIcon color="red" fontSize="17px" width="auto" /> Error
        </Flex>
      );
    default:
      return (
        <Flex alignItems="center" gap="2">
          <HelpIcon color="red" fontSize="17px" width="auto" /> Unknown
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

    const filter = uiSettings.pipelinesList.quickSearch;
    const filteredPipelines = (pipelinesApi.pipelines ?? [])
      ?.filter((pipeline) => pipeline?.tags?.__redpanda_cloud_pipeline_type !== 'agent') // Ensure we do not show the agents
      .filter((u) => {
        if (!filter) {
          return true;
        }
        const searchRegex = getSearchRegex(filter);
        return u.id.match(searchRegex) || u.displayName.match(searchRegex);
      });

    return (
      <PageContent>
        <ToastContainer />
        {/* Pipeline List */}

        {pipelinesApi.pipelines.length !== 0 && (
          <div className="my-5 flex flex-col gap-2">
            <LegacyCreatePipelineButton />
            <SearchField
              placeholderText="Enter search term / regex..."
              searchText={uiSettings.pipelinesList.quickSearch}
              setSearchText={(x) => {
                uiSettings.pipelinesList.quickSearch = x;
              }}
              width="350px"
            />
          </div>
        )}

        {(pipelinesApi.pipelines ?? []).length === 0 ? (
          <LegacyEmptyState />
        ) : (
          <DataTable<Pipeline>
            columns={[
              {
                header: 'ID',
                cell: ({ row: { original } }) => (
                  <Link params={{ pipelineId: encodeURIComponentPercents(original.id) }} to="/rp-connect/$pipelineId">
                    <Text>{original.id}</Text>
                  </Link>
                ),
                size: 100,
              },
              {
                header: 'Pipeline Name',
                cell: ({ row: { original } }) => (
                  <Link params={{ pipelineId: encodeURIComponentPercents(original.id) }} to="/rp-connect/$pipelineId">
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
