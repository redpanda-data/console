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
import { XIcon } from '@heroicons/react/solid';
import { Link as ChakraLink, createStandaloneToast } from '@redpanda-data/ui';
import { Box, Button, DataTable, Flex, SearchField, Stack, Text } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  PartitionTransformStatus_PartitionStatus,
  type TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1alpha1/transform_pb';
import { appGlobal } from '../../../state/appGlobal';
import { transformsApi } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { PageComponent, type PageInitHelper } from '../Page';
import { openDeleteModal } from './modals';
const { ToastContainer, toast } = createStandaloneToast();

export const PartitionStatus = observer((p: { status: PartitionTransformStatus_PartitionStatus }) => {
  switch (p.status) {
    case PartitionTransformStatus_PartitionStatus.UNSPECIFIED:
      return (
        <Flex alignItems="center" gap="2">
          <XIcon color="orange" height="14px" /> Unspecified
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
          <XIcon color="red" height="14px" /> Inactive
        </Flex>
      );
    case PartitionTransformStatus_PartitionStatus.ERRORED:
      return (
        <Flex alignItems="center" gap="2">
          <XIcon color="red" height="14px" /> Errored
        </Flex>
      );
    default:
      return <> Unknown</>;
  }
});

@observer
class TransformsList extends PageComponent<{}> {
  @observable placeholder = 5;

  constructor(p: any) {
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
    if (!transformsApi.transforms) return DefaultSkeleton;
    if (transformsApi.transforms.length === 0) {
      appGlobal.history.replace('/transforms-setup');
      return null;
    }

    const filteredTransforms = (transformsApi.transforms ?? []).filter((u) => {
      const filter = uiSettings.transformsList.quickSearch;
      if (!filter) return true;
      try {
        const quickSearchRegExp = new RegExp(filter, 'i');
        return u.name.match(quickSearchRegExp);
      } catch {
        return false;
      }
    });

    return (
      <PageContent>
        <ToastContainer />
        <Text maxWidth="600px">
          Data transforms let you run common data streaming tasks, like filtering, scrubbing, and transcoding, within
          Redpanda.{' '}
          <ChakraLink
            isExternal
            href="https://docs.redpanda.com/current/develop/data-transforms/how-transforms-work/"
            style={{ textDecoration: 'underline solid 1px' }}
          >
            Learn more
          </ChakraLink>
        </Text>

        <Stack direction="row" mb="6">
          <ReactRouterLink to="/transforms-setup">
            <Button variant="outline">Create transform</Button>
          </ReactRouterLink>

          <Button variant="outline" isDisabled>
            Export metrics
          </Button>
        </Stack>

        <Section>
          <Box mb="5">
            <SearchField
              width="350px"
              searchText={uiSettings.transformsList.quickSearch}
              setSearchText={(x) => (uiSettings.transformsList.quickSearch = x)}
              placeholderText="Enter search term / regex..."
            />
          </Box>

          <DataTable<TransformMetadata>
            data={filteredTransforms}
            pagination
            sorting
            columns={[
              {
                header: 'Name',
                accessorKey: 'name',
                size: 300,
                cell: ({ row: { original: r } }) => {
                  return (
                    <Box wordBreak="break-word" whiteSpace="break-spaces">
                      <Link to={`/transforms/${encodeURIComponentPercents(r.name)}`}>{r.name}</Link>
                    </Box>
                  );
                },
              },
              {
                header: 'Status',
                cell: ({ row: { original: r } }) => {
                  if (r.statuses.all((x) => x.status === PartitionTransformStatus_PartitionStatus.RUNNING))
                    return (
                      <Flex alignItems="center">
                        <PartitionStatus status={PartitionTransformStatus_PartitionStatus.RUNNING} />
                      </Flex>
                    );
                  // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
                  const partitionTransformStatus = r.statuses.first(
                    (x) => x.status !== PartitionTransformStatus_PartitionStatus.RUNNING,
                  )!;
                  // const enumType = proto3.getEnumType(PartitionTransformStatus_PartitionStatus);
                  // const entry = enumType.findNumber(s.status);

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
                cell: ({ row: { original: r } }) => {
                  return (
                    <Stack>
                      {r.outputTopicNames.map((n) => (
                        <Box key={n}>{n}</Box>
                      ))}
                    </Stack>
                  );
                },
              },
              {
                header: '',
                id: 'actions',
                cell: ({ row: { original: r } }) => (
                  <Button
                    variant="icon"
                    height="16px"
                    color="gray.500"
                    // disabledReason={api.userData?.canDeleteTransforms === false ? 'You don\'t have the \'canDeleteTransforms\' permission' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();

                      openDeleteModal(r.name, () => {
                        transformsApi
                          .deleteTransform(r.name)
                          .then(async () => {
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
                  >
                    <TrashIcon />
                  </Button>
                ),
                size: 1,
              },
            ]}
          />
        </Section>
      </PageContent>
    );
  }
}

export default TransformsList;
