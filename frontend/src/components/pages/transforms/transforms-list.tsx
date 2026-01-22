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

import {
  Box,
  Button,
  Link as ChakraLink,
  createStandaloneToast,
  DataTable,
  Flex,
  SearchField,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { CheckIcon, CloseIcon, TrashIcon } from 'components/icons';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';

import { openDeleteModal } from './modals';
import {
  PartitionTransformStatus_PartitionStatus,
  type TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1/transform_pb';
import { appGlobal } from '../../../state/app-global';
import { transformsApi } from '../../../state/backend-api';
import { uiSettings } from '../../../state/ui';
import { getSearchRegex } from '../../../utils/regex';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper } from '../page';

const { ToastContainer, toast } = createStandaloneToast();

export const PartitionStatus = observer((p: { status: PartitionTransformStatus_PartitionStatus }) => {
  switch (p.status) {
    case PartitionTransformStatus_PartitionStatus.UNSPECIFIED:
      return (
        <Flex alignItems="center" gap="2">
          <CloseIcon color="orange" height="14px" /> Unspecified
        </Flex>
      );
    case PartitionTransformStatus_PartitionStatus.RUNNING:
      return (
        <Flex alignItems="center" gap="2">
          <CheckIcon color="green" height="14px" /> Running
        </Flex>
      );
    case PartitionTransformStatus_PartitionStatus.INACTIVE:
      return (
        <Flex alignItems="center" gap="2">
          <CloseIcon color="red" height="14px" /> Inactive
        </Flex>
      );
    case PartitionTransformStatus_PartitionStatus.ERRORED:
      return (
        <Flex alignItems="center" gap="2">
          <CloseIcon color="red" height="14px" /> Errored
        </Flex>
      );
    default:
      return 'Unknown';
  }
});

@observer
class TransformsList extends PageComponent {
  @observable placeholder = 5;

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Data Transforms', '/transforms');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    transformsApi.refreshTransforms(force);
  }

  render() {
    if (!transformsApi.transforms) {
      return DefaultSkeleton;
    }
    if (transformsApi.transforms.length === 0) {
      appGlobal.historyReplace('/transforms-setup');
      return null;
    }

    const filter = uiSettings.transformsList.quickSearch;
    const filteredTransforms = (transformsApi.transforms ?? []).filter((u) => {
      if (!filter) {
        return true;
      }
      return u.name.match(getSearchRegex(filter));
    });

    return (
      <PageContent>
        <ToastContainer />
        <Text maxWidth="600px">
          Data transforms let you run common data streaming tasks, like filtering, scrubbing, and transcoding, within
          Redpanda.{' '}
          <ChakraLink
            href="https://docs.redpanda.com/current/develop/data-transforms/how-transforms-work/"
            isExternal
            style={{ textDecoration: 'underline solid 1px' }}
          >
            Learn more
          </ChakraLink>
        </Text>

        <Stack direction="row" mb="6">
          <Link to="/transforms-setup">
            <Button variant="outline">Create transform</Button>
          </Link>

          <Button isDisabled variant="outline">
            Export metrics
          </Button>
        </Stack>

        <Section>
          <Box mb="5">
            <SearchField
              placeholderText="Enter search term / regex..."
              searchText={uiSettings.transformsList.quickSearch}
              setSearchText={(x) => {
                uiSettings.transformsList.quickSearch = x;
              }}
              width="350px"
            />
          </Box>

          <DataTable<TransformMetadata>
            columns={[
              {
                header: 'Name',
                accessorKey: 'name',
                size: 300,
                cell: ({ row: { original: r } }) => (
                  <Box whiteSpace="break-spaces" wordBreak="break-word">
                    <Link
                      params={{ transformName: encodeURIComponentPercents(r.name) }}
                      to="/transforms/$transformName"
                    >
                      {r.name}
                    </Link>
                  </Box>
                ),
              },
              {
                header: 'Status',
                cell: ({ row: { original: r } }) => {
                  if (r.statuses.all((x) => x.status === PartitionTransformStatus_PartitionStatus.RUNNING)) {
                    return (
                      <Flex alignItems="center">
                        <PartitionStatus status={PartitionTransformStatus_PartitionStatus.RUNNING} />
                      </Flex>
                    );
                  }
                  // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
                  const partitionTransformStatus = r.statuses.first(
                    (x) => x.status !== PartitionTransformStatus_PartitionStatus.RUNNING
                  )!;

                  return (
                    <Flex alignItems="center">
                      <PartitionStatus status={partitionTransformStatus.status} />
                    </Flex>
                  );
                },
              },
              {
                header: 'Input topic',
                accessorKey: 'inputTopicName',
              },
              {
                header: 'Output topics',
                cell: ({ row: { original: r } }) => (
                  <Stack>
                    {r.outputTopicNames.map((n) => (
                      <Box key={n}>{n}</Box>
                    ))}
                  </Stack>
                ),
              },
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

                      openDeleteModal(r.name, () => {
                        transformsApi
                          .deleteTransform(r.name)
                          .then(() => {
                            toast({
                              status: 'success',
                              duration: 4000,
                              isClosable: false,
                              title: 'Transform deleted',
                            });
                            transformsApi.refreshTransforms(true);
                          })
                          .catch((err) => {
                            toast({
                              status: 'error',
                              duration: null,
                              isClosable: true,
                              title: 'Failed to delete transform',
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
            data={filteredTransforms}
            pagination
            sorting
          />
        </Section>
      </PageContent>
    );
  }
}

export default TransformsList;
