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

import { create } from '@bufbuild/protobuf';
import { useMutation, useQuery } from '@connectrpc/connect-query';
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
import { runInAction } from 'mobx';
import { useEffect, useState } from 'react';
import { AiOutlineDelete } from 'react-icons/ai';
import { Link } from 'react-router-dom';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import type { KnowledgeBase } from '../../../protogen/redpanda/api/dataplane/v1alpha1/knowledge_base_pb';
import {
  DeleteKnowledgeBaseRequestSchema,
  ListKnowledgeBasesRequestSchema,
} from '../../../protogen/redpanda/api/dataplane/v1alpha1/knowledge_base_pb';
import {
  deleteKnowledgeBase,
  listKnowledgeBases,
} from '../../../protogen/redpanda/api/dataplane/v1alpha1/knowledge_base-KnowledgeBaseService_connectquery';
import { Features } from '../../../state/supportedFeatures';
import { uiState } from '../../../state/uiState';
import { openModal } from '../../../utils/ModalContainer';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import { ExplicitConfirmModal } from '../rp-connect/modals';

const { ToastContainer, toast } = createStandaloneToast();

// Update page title and breadcrumbs
const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Knowledge Bases';
    uiState.pageBreadcrumbs.pop();
    uiState.pageBreadcrumbs.push({ title: 'Knowledge Bases', linkTo: '/knowledgebases', heading: 'Knowledge Bases' });
  });
};

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

export const KnowledgeBaseList = () => {
  const [searchText, setSearchText] = useState('');

  // Set up page title and breadcrumbs
  useEffect(() => {
    updatePageTitle();
  }, []);

  // Fetch knowledge bases using React Query
  const {
    data: knowledgeBasesData,
    isLoading,
    error,
    refetch,
  } = useQuery(listKnowledgeBases, create(ListKnowledgeBasesRequestSchema, {}), {
    enabled: Features.pipelinesApi,
  });

  const deleteMutation = useMutation(deleteKnowledgeBase, {
    onSuccess: () => {
      toast({
        status: 'success',
        duration: 4000,
        isClosable: false,
        title: 'Knowledge base deleted',
      });
      refetch();
    },
    onError: (err) => {
      toast({
        status: 'error',
        duration: null,
        isClosable: true,
        title: 'Failed to delete knowledge base',
        description: String(err),
      });
    },
  });

  // Show error toast if there's an error (but not 404 for OSS version)
  useEffect(() => {
    if (error && Features.pipelinesApi) {
      const errorStr = String(error);
      if (!errorStr.includes('404')) {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to load knowledge bases',
          description: errorStr,
        });
      }
    }
  }, [error]);

  // Show loading skeleton while data is loading
  if (isLoading) {
    return DefaultSkeleton;
  }

  const knowledgeBases = knowledgeBasesData?.knowledgeBases ?? [];

  // Filter knowledge bases based on search text
  const filteredKnowledgeBases = knowledgeBases.filter((kb) => {
    if (!searchText) return true;
    try {
      const quickSearchRegExp = new RegExp(searchText, 'i');
      if (kb.id.match(quickSearchRegExp)) return true;
      if (kb.displayName.match(quickSearchRegExp)) return true;
      if (kb.description.match(quickSearchRegExp)) return true;
      return false;
    } catch {
      return false;
    }
  });

  const handleDeleteKnowledgeBase = (knowledgeBaseId: string, displayName: string) => {
    openDeleteKnowledgeBaseModal(displayName, () => {
      deleteMutation.mutate(create(DeleteKnowledgeBaseRequestSchema, { id: knowledgeBaseId }));
    });
  };

  return (
    <PageContent>
      <ToastContainer />

      <Stack spacing={8}>
        <Stack spacing={4}>
          <Text>
            Knowledge bases store and organize your documents, data, and content for AI-powered retrieval and chat. They
            enable Retrieval-Augmented Generation (RAG) by connecting language models with your specific information,
            providing accurate, contextual responses grounded in your data. Upload documents, configure embeddings, and
            create intelligent systems that can answer questions and provide insights from your knowledge repository.
          </Text>
          <CreateKnowledgeBaseButton />
        </Stack>

        {knowledgeBases.length !== 0 && (
          <SearchField
            width="350px"
            searchText={searchText}
            setSearchText={setSearchText}
            placeholderText="Filter knowledge bases..."
          />
        )}

        {knowledgeBases.length === 0 ? (
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
                        handleDeleteKnowledgeBase(r.id, r.displayName);
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
};

export default KnowledgeBaseList;
