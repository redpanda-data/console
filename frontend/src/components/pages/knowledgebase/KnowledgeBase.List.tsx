/**
 * Copyright 2024 Redpanda Data, Inc.
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
  ButtonGroup,
  createStandaloneToast,
  DataTable,
  Flex,
  HStack,
  Icon,
  Image,
  SearchField,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { AiOutlineDelete } from 'react-icons/ai';
import { Link } from 'react-router-dom';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import type { KnowledgeBase } from '../../../protogen/redpanda/api/dataplane/v1alpha1/knowledge_base_pb';
import { appGlobal } from '../../../state/appGlobal';
import { knowledgebaseApi } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';
import { uiSettings } from '../../../state/ui';
import { openModal } from '../../../utils/ModalContainer';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { ExplicitConfirmModal } from '../rp-connect/modals';

const { ToastContainer, toast } = createStandaloneToast();

function openDeleteKnowledgeBaseModal(knowledgeBaseName: string, onConfirm: () => void) {
  openModal(ExplicitConfirmModal, {
    title: <>Permanently delete knowledge base {knowledgeBaseName}</>,
    body: <>Deleting a knowledge base cannot be undone.</>,
    primaryButtonContent: <>Delete</>,
    secondaryButtonContent: <>Cancel</>,

    requiredText: knowledgeBaseName.trim(),

    onPrimaryButton: (closeModal) => {
      onConfirm();
      closeModal();
    },

    onSecondaryButton: (closeModal) => {
      closeModal();
    },
  });
}

const CreateKnowledgeBaseButton = () => {
  return (
    <ButtonGroup>
      <Button variant="outline" data-testid="create-knowledge-base-button">
        <Link to={'/knowledgebases/create'} style={{ textDecoration: 'none', color: 'inherit' }}>
          Create knowledge base
        </Link>
      </Button>
    </ButtonGroup>
  );
};

const EmptyPlaceholder = () => {
  return (
    <Flex alignItems="center" justifyContent="center" flexDirection="column" gap="4" mb="4">
      <Image src={EmptyConnectors} />
      <Box>You have no knowledge bases.</Box>
      <CreateKnowledgeBaseButton />
    </Flex>
  );
};

@observer
class KnowledgeBaseList extends PageComponent<{}> {
  @observable placeholder = 5;

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    p.addBreadcrumb('Knowledge Bases', '/knowledgebases');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    if (!Features.pipelinesApi) return;

    knowledgebaseApi.refreshKnowledgeBases(force).catch((err) => {
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
          title: 'Failed to load knowledge bases',
          description: String(err),
        });
      }
    });
  }

  render() {
    if (!knowledgebaseApi.knowledgeBases) return DefaultSkeleton;

    const filteredKnowledgeBases = (knowledgebaseApi.knowledgeBases ?? []).filter((kb) => {
      const filter = uiSettings.knowledgeBaseList.quickSearch;
      if (!filter) return true;
      try {
        const quickSearchRegExp = new RegExp(filter, 'i');
        if (kb.id.match(quickSearchRegExp)) return true;
        if (kb.displayName.match(quickSearchRegExp)) return true;
        if (kb.description.match(quickSearchRegExp)) return true;
        return false;
      } catch {
        return false;
      }
    });

    return (
      <PageContent>
        <ToastContainer />

        <Stack spacing={8}>
          <Stack spacing={4}>
            <Text>
              Knowledge bases store and organize your documents, data, and content for AI-powered retrieval and chat.
              They enable Retrieval-Augmented Generation (RAG) by connecting language models with your specific
              information, providing accurate, contextual responses grounded in your data. Upload documents, configure
              embeddings, and create intelligent systems that can answer questions and provide insights from your
              knowledge repository.
            </Text>
            <CreateKnowledgeBaseButton />
          </Stack>

          {knowledgebaseApi.knowledgeBases.length !== 0 && (
            <SearchField
              width="350px"
              searchText={uiSettings.knowledgeBaseList.quickSearch}
              setSearchText={(x) => (uiSettings.knowledgeBaseList.quickSearch = x)}
              placeholderText="Filter knowledge bases..."
            />
          )}

          {(knowledgebaseApi.knowledgeBases ?? []).length === 0 ? (
            <EmptyPlaceholder />
          ) : (
            <DataTable<KnowledgeBase>
              data={filteredKnowledgeBases}
              pagination
              defaultPageSize={10}
              sorting
              columns={[
                {
                  header: 'ID',
                  cell: ({ row: { original } }) => (
                    <Link to={`/knowledgebases/${encodeURIComponentPercents(original.id)}`}>
                      <Text>{original.id}</Text>
                    </Link>
                  ),
                  size: 100,
                },
                {
                  header: 'Name',
                  cell: ({ row: { original } }) => (
                    <Link to={`/knowledgebases/${encodeURIComponentPercents(original.id)}`}>
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
                  header: 'Tags',
                  cell: ({ row: { original } }) => {
                    const tags = original.tags ? Object.entries(original.tags) : [];
                    return (
                      <Flex gap={1} flexWrap="wrap">
                        {tags.map(([key, value]) => (
                          <Text key={key} fontSize="sm" color="gray.600">
                            {key}: {value}
                          </Text>
                        ))}
                      </Flex>
                    );
                  },
                  size: 150,
                },
                {
                  header: '',
                  id: 'actions',
                  cell: ({ row: { original: r } }) => (
                    <HStack spacing={4} justifyContent="flex-end" width="100%">
                      <Icon
                        data-testid={`delete-knowledge-base-${r.id}`}
                        as={AiOutlineDelete}
                        onClick={(e: React.MouseEvent<SVGElement, MouseEvent>) => {
                          e.stopPropagation();
                          e.preventDefault();

                          openDeleteKnowledgeBaseModal(r.displayName, () => {
                            knowledgebaseApi
                              .deleteKnowledgeBase(r.id)
                              .then(async () => {
                                toast({
                                  status: 'success',
                                  duration: 4000,
                                  isClosable: false,
                                  title: 'Knowledge base deleted',
                                });
                                knowledgebaseApi.refreshKnowledgeBases(true);
                              })
                              .catch((err) => {
                                toast({
                                  status: 'error',
                                  duration: null,
                                  isClosable: true,
                                  title: 'Failed to delete knowledge base',
                                  description: String(err),
                                });
                              });
                          });
                        }}
                        cursor="pointer"
                        aria-label="Delete knowledge base"
                      />
                    </HStack>
                  ),
                  size: 1,
                },
              ]}
              emptyText=""
            />
          )}
        </Stack>
      </PageContent>
    );
  }
}

export default KnowledgeBaseList;
