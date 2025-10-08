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
import type { KnowledgeBase } from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { DeleteKnowledgeBaseRequestSchema } from '../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useDeleteKnowledgeBaseMutation, useListKnowledgeBasesQuery } from '../../../react-query/api/knowledge-base';
import { Features } from '../../../state/supported-features';
import { uiState } from '../../../state/ui-state';
import { openModal } from '../../../utils/modal-container';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { encodeURIComponentPercents } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import { ExplicitConfirmModal } from '../rp-connect/modals';

const { ToastContainer, toast } = createStandaloneToast();

// Update page title and breadcrumbs
const updatePageTitle = () => {
  runInAction(() => {
    uiState.pageTitle = 'Knowledge Bases';
    uiState.pageBreadcrumbs.pop();
    uiState.pageBreadcrumbs.push({
      title: 'Knowledge Bases',
      linkTo: '/knowledgebases',
      heading: 'Knowledge Bases',
    });
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

const CreateKnowledgeBaseButton = () => (
  <ButtonGroup>
    <Button data-testid="create-knowledge-base-button" variant="outline">
      <Link style={{ textDecoration: 'none', color: 'inherit' }} to={'/knowledgebases/create'}>
        Create knowledge base
      </Link>
    </Button>
  </ButtonGroup>
);

const EmptyPlaceholder = () => (
  <Flex alignItems="center" flexDirection="column" gap="4" justifyContent="center" mb="4">
    <Image src={EmptyConnectors} />
    <Box>You have no knowledge bases.</Box>
    <CreateKnowledgeBaseButton />
  </Flex>
);

export const KnowledgeBaseList = () => {
  const [searchText, setSearchText] = useState('');

  // Set up page title and breadcrumbs
  useEffect(() => {
    updatePageTitle();
  }, []);

  // Fetch knowledge bases using reusable hook
  const {
    data: knowledgeBasesData,
    isLoading,
    error,
    refetch,
  } = useListKnowledgeBasesQuery(
    {},
    {
      enabled: Features.pipelinesApi,
    }
  );

  const deleteMutation = useDeleteKnowledgeBaseMutation();

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
    if (!searchText) {
      return true;
    }
    try {
      const quickSearchRegExp = new RegExp(searchText, 'i');
      if (kb.id.match(quickSearchRegExp)) {
        return true;
      }
      if (kb.displayName.match(quickSearchRegExp)) {
        return true;
      }
      if (kb.description.match(quickSearchRegExp)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });

  const handleDeleteKnowledgeBase = (knowledgeBaseId: string, displayName: string) => {
    openDeleteKnowledgeBaseModal(displayName, () => {
      deleteMutation.mutate(create(DeleteKnowledgeBaseRequestSchema, { id: knowledgeBaseId }), {
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
            placeholderText="Filter knowledge bases..."
            searchText={searchText}
            setSearchText={setSearchText}
            width="350px"
          />
        )}

        {knowledgeBases.length === 0 ? (
          <EmptyPlaceholder />
        ) : (
          <DataTable<KnowledgeBase>
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
                header: 'Tags',
                cell: ({ row: { original } }) => {
                  const tags = original.tags ? Object.entries(original.tags) : [];
                  return (
                    <Flex flexWrap="wrap" gap={1}>
                      {tags.map(([key, value]) => (
                        <Text color="gray.600" fontSize="sm" key={key}>
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
                  <HStack justifyContent="flex-end" spacing={4} width="100%">
                    <Icon
                      aria-label="Delete knowledge base"
                      as={AiOutlineDelete}
                      cursor="pointer"
                      data-testid={`delete-knowledge-base-${r.id}`}
                      onClick={(e: React.MouseEvent<SVGElement, MouseEvent>) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDeleteKnowledgeBase(r.id, r.displayName);
                      }}
                    />
                  </HStack>
                ),
                size: 1,
              },
            ]}
            data={filteredKnowledgeBases}
            defaultPageSize={10}
            emptyText=""
            pagination
            sorting
          />
        )}
      </Stack>
    </PageContent>
  );
};

export default KnowledgeBaseList;
