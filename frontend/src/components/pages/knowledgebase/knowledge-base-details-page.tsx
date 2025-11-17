/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

'use client';

import { create } from '@bufbuild/protobuf';
import { FieldMaskSchema } from '@bufbuild/protobuf/wkt';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { ArrowLeft } from 'lucide-react';
import { runInAction } from 'mobx';
import type { KnowledgeBaseUpdate } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { UpdateKnowledgeBaseRequestSchema } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLegacyConsumerGroupDetailsQuery } from 'react-query/api/consumer-group';
import { useGetKnowledgeBaseQuery, useUpdateKnowledgeBaseMutation } from 'react-query/api/knowledge-base';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';

import { KnowledgeBaseEditTabs } from './knowledge-base-edit-tabs';
import { ShortNum } from '../../misc/short-num';

export const updatePageTitle = (knowledgebaseId?: string) => {
  runInAction(() => {
    uiState.pageTitle = knowledgebaseId ? `Knowledge Base - ${knowledgebaseId}` : 'Knowledge Base Details';
    uiState.pageBreadcrumbs = [
      { title: 'Knowledge Bases', linkTo: '/knowledgebases' },
      { title: knowledgebaseId || 'Details', linkTo: '', heading: knowledgebaseId || 'Knowledge Base Details' },
    ];
  });
};

export const KnowledgeBaseDetailsPage = () => {
  const { knowledgebaseId } = useParams<{ knowledgebaseId: string }>();
  const navigate = useNavigate();
  const editTabsRef = useRef<KnowledgeBaseEditTabs>(null);

  // Local state
  const [isEditMode, setIsEditMode] = useState(false);
  const [formHasChanges, setFormHasChanges] = useState(false);

  // Fetch knowledge base data
  const {
    data: knowledgeBaseResponse,
    isLoading: isLoadingKnowledgeBase,
    error: knowledgeBaseError,
    refetch: refetchKnowledgeBase,
  } = useGetKnowledgeBaseQuery({ id: knowledgebaseId || '' });

  const knowledgeBase = knowledgeBaseResponse?.knowledgeBase;

  // Compute consumer group ID
  const consumerGroupId = useMemo(() => (knowledgeBase ? `${knowledgeBase.id}-indexer` : ''), [knowledgeBase]);

  // Fetch consumer group data
  const {
    data: consumerGroup,
    isLoading: isLoadingConsumerGroup,
    error: consumerGroupError,
    refetch: refetchConsumerGroup,
  } = useLegacyConsumerGroupDetailsQuery(consumerGroupId, {
    enabled: !!consumerGroupId,
  });

  // Mutations
  const { mutate: updateKnowledgeBase, isPending: isUpdating } = useUpdateKnowledgeBaseMutation();

  // Preload secrets for knowledge base configuration
  useListSecretsQuery(undefined, { enabled: !!knowledgebaseId });

  useEffect(() => {
    if (knowledgebaseId) {
      updatePageTitle(knowledgebaseId);
    }
  }, [knowledgebaseId]);

  // Handlers
  const handleStartEdit = () => {
    setIsEditMode(true);
    setFormHasChanges(false);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setFormHasChanges(false);
  };

  const handleSave = async () => {
    if (editTabsRef.current) {
      await editTabsRef.current.handleSave();
    }
  };

  const handleUpdate = (updatedKnowledgeBase: KnowledgeBaseUpdate, updateMask?: string[]) => {
    if (!knowledgeBase) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const request = create(UpdateKnowledgeBaseRequestSchema, {
        id: knowledgeBase.id,
        knowledgeBase: updatedKnowledgeBase,
        updateMask: updateMask ? create(FieldMaskSchema, { paths: updateMask }) : undefined,
      });

      updateKnowledgeBase(request, {
        onSuccess: () => {
          toast.success('Knowledge base updated successfully');
          refetchKnowledgeBase();
          refetchConsumerGroup();
          setIsEditMode(false);
          setFormHasChanges(false);
          resolve();
        },
        onError: (err: unknown) => {
          toast.error('Failed to update knowledge base', {
            description: String(err),
          });
          reject(err);
        },
      });
    });
  };

  const handleFormChange = (hasChanges: boolean) => {
    setFormHasChanges(hasChanges);
  };

  // Loading state
  if (isLoadingKnowledgeBase) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="mt-4 h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Error state
  if (knowledgeBaseError || !knowledgeBase) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <Text className="text-red-600">
            {knowledgeBaseError
              ? `Failed to load knowledge base: ${String(knowledgeBaseError)}`
              : 'Knowledge base not found'}
          </Text>
          <Button className="mt-4" onClick={() => navigate('/knowledgebases')} variant="outline">
            Back to Knowledge Bases
          </Button>
        </div>
      </div>
    );
  }

  const consumerGroupLoadFailed = !!consumerGroupError;

  // Helper function to render consumer group status
  const renderConsumerGroupStatus = () => {
    if (consumerGroup) {
      const memberCount = consumerGroup.members?.length ?? 0;
      const state = consumerGroup.state || '-';
      return (
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-xl">{state}</span>
          <Text className="text-sm" variant="muted">
            ({memberCount} members)
          </Text>
        </div>
      );
    }

    if (consumerGroupLoadFailed) {
      return (
        <Text className="text-xl" title="Consumer group not yet available" variant="muted">
          Initializing...
        </Text>
      );
    }

    if (isLoadingConsumerGroup) {
      return <Skeleton className="h-7 w-32" />;
    }

    return (
      <Text className="text-xl" variant="muted">
        -
      </Text>
    );
  };

  // Helper function to render consumer group lag
  const renderConsumerGroupLag = () => {
    if (consumerGroup) {
      const lagValue = consumerGroup.lagSum ?? 0;
      return (
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-xl">
            <ShortNum tooltip={false} value={lagValue} />
          </span>
          <Text className="text-sm" variant="muted">
            messages
          </Text>
        </div>
      );
    }

    if (isLoadingConsumerGroup) {
      return <Skeleton className="h-7 w-32" />;
    }

    return (
      <Text className="text-xl" variant="muted">
        -
      </Text>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <div>
        <Button onClick={() => navigate('/knowledgebases')} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Knowledge Bases
        </Button>
      </div>

      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level={1}>{knowledgeBase.displayName}</Heading>
          {knowledgeBase.description && (
            <Text className="mt-2" variant="muted">
              {knowledgeBase.description}
            </Text>
          )}
        </div>
        <div className="flex gap-2">
          {isEditMode ? (
            <>
              <Button onClick={handleCancelEdit} variant="outline">
                Cancel
              </Button>
              <Button disabled={!formHasChanges || isUpdating} onClick={handleSave}>
                Save Changes
              </Button>
            </>
          ) : (
            <Button onClick={handleStartEdit}>Edit</Button>
          )}
        </div>
      </div>

      {/* Consumer Group Status Card */}
      <Card>
        <CardContent>
          <div className="flex gap-8">
            <div>
              <Text className="mb-1 font-medium text-sm" variant="muted">
                Indexer Status
              </Text>
              {renderConsumerGroupStatus()}
            </div>

            <div>
              <Text className="mb-1 font-medium text-sm" variant="muted">
                Consumer Lag
              </Text>
              {renderConsumerGroupLag()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Tabs - Keep existing component for now */}
      <KnowledgeBaseEditTabs
        isEditMode={isEditMode}
        knowledgeBase={knowledgeBase}
        onCancel={handleCancelEdit}
        onFormChange={handleFormChange}
        onSave={handleUpdate}
        ref={editTabsRef}
      />
    </div>
  );
};
