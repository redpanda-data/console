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
import { ConnectError } from '@connectrpc/connect';
import { Button } from 'components/redpanda-ui/components/button';
import { Form, FormContainer } from 'components/redpanda-ui/components/form';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { Loader2 } from 'lucide-react';
import { runInAction } from 'mobx';
import {
  CreateKnowledgeBaseRequestSchema,
  KnowledgeBaseCreateSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useCreateKnowledgeBaseMutation } from 'react-query/api/knowledge-base';
import { useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { createFormResolver } from 'utils/form-validation';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

import { BasicInformationSection } from './basic-information-section';
import { EmbeddingGeneratorSection } from './embedding-generator-section';
import { IndexerSection } from './indexer-section';
import { RetrievalSection } from './retrieval-section';
import {
  buildKnowledgeBaseCreate,
  initialValues,
  type KnowledgeBaseCreateFormValues,
  validateFormValues,
} from './schemas';
import { VectorDatabaseSection } from './vector-database-section';

export const KnowledgeBaseCreatePage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createKnowledgeBase, isPending: isCreating } = useCreateKnowledgeBaseMutation();
  const { data: secretsData } = useListSecretsQuery();

  // Form setup with real-time custom + proto validation
  const form = useForm<KnowledgeBaseCreateFormValues>({
    resolver: createFormResolver({
      customValidator: validateFormValues,
      protoBuilder: buildKnowledgeBaseCreate,
      protoSchema: KnowledgeBaseCreateSchema,
    }),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  // Watch form values for dynamic updates
  const embeddingProvider = form.watch('embeddingProvider');
  const rerankerEnabled = form.watch('rerankerEnabled');

  // Tags field array
  const {
    fields: tagFields,
    append: appendTag,
    remove: removeTag,
  } = useFieldArray({
    control: form.control,
    name: 'tagsArray',
  });

  // Update page title and breadcrumbs
  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Create Knowledge Base';
      uiState.pageBreadcrumbs.pop();
      uiState.pageBreadcrumbs.push({
        title: 'Knowledge Bases',
        linkTo: '/knowledgebases',
      });
      uiState.pageBreadcrumbs.push({
        title: 'Create',
        linkTo: '/knowledgebases/create',
      });
    });
  }, []);

  // Get available secrets
  const availableSecrets = useMemo(() => {
    if (!secretsData?.secrets) {
      return [];
    }
    return secretsData.secrets
      .filter((secret): secret is NonNullable<typeof secret> & { id: string } => !!secret?.id)
      .map((secret) => ({
        id: secret.id,
        name: secret.id,
      }));
  }, [secretsData]);

  // Auto-populate secrets fields based on name patterns
  useEffect(() => {
    if (availableSecrets.length === 0) {
      return;
    }

    // Helper function to find a secret by pattern (case-insensitive)
    const findSecretByPattern = (pattern: string): string | undefined => {
      const upperPattern = pattern.toUpperCase();

      // First try to find an exact match
      const exactMatch = availableSecrets.find((s) => s.id.toUpperCase() === upperPattern);
      if (exactMatch) {
        return exactMatch.id;
      }

      // Then try to find a secret containing the pattern
      const patternMatch = availableSecrets.find((s) => s.id.toUpperCase().includes(upperPattern));
      if (patternMatch) {
        return patternMatch.id;
      }

      return undefined;
    };

    // Map fields to their pattern keywords
    const fieldPatternMappings: Record<string, string> = {
      postgresDsn: 'POSTGRES',
      openaiApiKey: 'OPENAI',
      cohereApiKey: 'COHERE',
      rerankerApiKey: 'COHERE', // TODO: Update once we have more reranker providers
      redpandaPassword: 'PASSWORD',
    };

    for (const [fieldName, pattern] of Object.entries(fieldPatternMappings)) {
      const currentValue = form.getValues(fieldName as keyof KnowledgeBaseCreateFormValues) as string;

      // Only auto-populate if field is empty
      if (!currentValue || currentValue.trim() === '') {
        const matchingSecret = findSecretByPattern(pattern);
        if (matchingSecret) {
          form.setValue(fieldName as keyof KnowledgeBaseCreateFormValues, matchingSecret as never);
        }
      }
    }
  }, [availableSecrets, form]);

  const onSubmit = async (values: KnowledgeBaseCreateFormValues) => {
    try {
      // Build proto message (validation already done by resolver)
      const knowledgeBase = buildKnowledgeBaseCreate(values);

      // Submit to API
      const response = await createKnowledgeBase(create(CreateKnowledgeBaseRequestSchema, { knowledgeBase }));
      toast.success('Knowledge base created successfully');
      navigate(response.knowledgeBase ? `/knowledgebases/${response?.knowledgeBase?.id}` : '/knowledgebases');
    } catch (error) {
      const connectError = ConnectError.from(error);
      toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'create', entity: 'knowledge base' }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="space-y-2">
        <Heading level={1}>Create Knowledge Base</Heading>
        <Text variant="muted">Set up a new knowledge base from scratch</Text>
      </div>

      <Form {...form}>
        <FormContainer className="w-full" layout="default" onSubmit={form.handleSubmit(onSubmit)} width="full">
          <div className="space-y-4">
            <BasicInformationSection appendTag={appendTag} form={form} removeTag={removeTag} tagFields={tagFields} />

            <VectorDatabaseSection availableSecrets={availableSecrets} form={form} />

            <EmbeddingGeneratorSection
              availableSecrets={availableSecrets}
              embeddingProvider={embeddingProvider}
              form={form}
            />

            <IndexerSection availableSecrets={availableSecrets} form={form} />

            <RetrievalSection availableSecrets={availableSecrets} form={form} rerankerEnabled={rerankerEnabled} />

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button onClick={() => navigate('/knowledgebases')} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={!form.formState.isValid || isCreating} type="submit">
                {isCreating ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <Text as="span">Creating...</Text>
                  </div>
                ) : (
                  'Create'
                )}
              </Button>
            </div>
          </div>
        </FormContainer>
      </Form>
    </div>
  );
};
