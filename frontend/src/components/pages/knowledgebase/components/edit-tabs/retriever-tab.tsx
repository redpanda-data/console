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

import type { TabPropsWithSecrets } from './types';
import { SingleSelect } from '../../../../misc/select';
import { Checkbox } from '../../../../redpanda-ui/components/checkbox';
import { FormItem, FormLabel } from '../../../../redpanda-ui/components/form';
import { Input } from '../../../../redpanda-ui/components/input';
import { SecretDropdownField } from '../form-fields/secret-dropdown-field';

export const RetrieverTab = ({
  knowledgeBase,
  isEditMode,
  formData,
  onUpdateFormData,
  onOpenAddSecret,
}: TabPropsWithSecrets) => {
  const retriever = knowledgeBase.retriever;
  const reranker = retriever?.reranker;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">Retriever</h2>

      {isEditMode ? (
        <>
          <FormItem>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.retriever?.reranker?.enabled}
                onCheckedChange={(checked) => onUpdateFormData('retriever.reranker.enabled', checked)}
              />
              <FormLabel className="mb-0 font-medium">Enable Reranker (Recommended)</FormLabel>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              Reranker improves search quality by reordering retrieved documents based on relevance.
            </p>
          </FormItem>

          {formData.retriever?.reranker?.enabled && (
            <>
              <FormItem>
                <FormLabel>Provider</FormLabel>
                <SingleSelect
                  onChange={(value) => onUpdateFormData('retriever.reranker.provider.provider.case', value)}
                  options={[{ value: 'cohere', label: 'Cohere' }]}
                  value={formData.retriever?.reranker?.provider?.provider.case || 'cohere'}
                />
              </FormItem>

              <FormItem>
                <FormLabel>
                  Model
                  <span className="ml-1 text-destructive">*</span>
                </FormLabel>
                <Input
                  onChange={(e) => onUpdateFormData('retriever.reranker.provider.provider.value.model', e.target.value)}
                  value={formData.retriever?.reranker?.provider?.provider.value?.model || 'rerank-v3.5'}
                />
              </FormItem>

              <SecretDropdownField
                helperText="All credentials are securely stored in your Secrets Store"
                isRequired
                label="API Key"
                onChange={(value) => onUpdateFormData('retriever.reranker.provider.provider.value.apiKey', value)}
                onCreateNew={() => onOpenAddSecret('retriever.reranker.provider.provider.value.apiKey')}
                placeholder="Select Cohere API key from secrets"
                value={formData.retriever?.reranker?.provider?.provider.value?.apiKey || ''}
              />
            </>
          )}
        </>
      ) : (
        <>
          <FormItem>
            <div className="flex items-center gap-2">
              <Checkbox checked={reranker?.enabled} disabled={true} />
              <FormLabel className="mb-0 font-medium">Enable Reranker (Recommended)</FormLabel>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              Reranker improves search quality by reordering retrieved documents based on relevance.
            </p>
          </FormItem>

          {reranker?.enabled && reranker.provider && (
            <>
              <FormItem>
                <FormLabel>Provider</FormLabel>
                <Input disabled value={reranker.provider.provider.case || 'Not configured'} />
              </FormItem>

              {reranker.provider.provider.case === 'cohere' && (
                <>
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <Input disabled value={reranker.provider.provider.value.model} />
                  </FormItem>
                  <FormItem>
                    <FormLabel>API Key</FormLabel>
                    <Input disabled value={reranker.provider.provider.value.apiKey || 'Not configured'} />
                  </FormItem>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
