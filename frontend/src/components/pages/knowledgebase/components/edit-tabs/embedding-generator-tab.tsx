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
import { FormItem, FormLabel } from '../../../../redpanda-ui/components/form';
import { Input } from '../../../../redpanda-ui/components/input';
import { SecretDropdownField } from '../form-fields/secret-dropdown-field';

export const EmbeddingGeneratorTab = ({
  knowledgeBase,
  isEditMode,
  onUpdateFormData,
  onOpenAddSecret,
}: TabPropsWithSecrets) => {
  const embeddingGen = knowledgeBase.embeddingGenerator;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">Embedding Generator</h2>
      {isEditMode ? (
        <>
          <h3 className="font-semibold text-md">
            {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
          </h3>

          <FormItem>
            <FormLabel>Model</FormLabel>
            <Input disabled value={embeddingGen?.model || ''} />
          </FormItem>

          {embeddingGen?.provider?.provider.case === 'openai' && (
            <p className="-mt-2 mb-2 text-muted-foreground text-sm">
              See{' '}
              <a
                className="text-blue-500"
                href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                rel="noopener noreferrer"
                target="_blank"
              >
                OpenAI embedding models
              </a>{' '}
              for available models and dimensions.
            </p>
          )}

          {embeddingGen?.provider?.provider.case === 'cohere' && (
            <p className="-mt-2 mb-2 text-muted-foreground text-sm">
              See{' '}
              <a
                className="text-blue-500"
                href="https://docs.cohere.com/docs/cohere-embed"
                rel="noopener noreferrer"
                target="_blank"
              >
                Cohere embedding models
              </a>{' '}
              for available models and dimensions.
            </p>
          )}

          <FormItem>
            <FormLabel>Dimensions</FormLabel>
            <Input disabled value={embeddingGen?.dimensions?.toString() || ''} />
          </FormItem>

          <SecretDropdownField
            helperText="All credentials are securely stored in your Secrets Store"
            isRequired
            label="API Key"
            onChange={(value) => {
              const path =
                embeddingGen?.provider?.provider.case === 'openai'
                  ? 'embeddingGenerator.provider.provider.value.apiKey'
                  : 'embeddingGenerator.provider.provider.value.apiKey';
              onUpdateFormData(path, value);
            }}
            onCreateNew={() => onOpenAddSecret('embeddingGenerator.provider.provider.value.apiKey')}
            placeholder={`Select ${embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} API key from secrets`}
            value={(() => {
              if (embeddingGen?.provider?.provider.case === 'openai') {
                return embeddingGen.provider.provider.value.apiKey;
              }
              if (embeddingGen?.provider?.provider.case === 'cohere') {
                return embeddingGen.provider.provider.value.apiKey;
              }
              return '';
            })()}
          />
        </>
      ) : (
        <>
          <h3 className="font-semibold text-md">
            {embeddingGen?.provider?.provider.case === 'openai' ? 'OpenAI' : 'Cohere'} Configuration
          </h3>
          <FormItem>
            <FormLabel>Model</FormLabel>
            <Input disabled value={embeddingGen?.model || 'Not configured'} />
          </FormItem>

          {embeddingGen?.provider?.provider.case === 'openai' && (
            <p className="-mt-2 mb-2 text-muted-foreground text-sm">
              See{' '}
              <a
                className="text-blue-500"
                href="https://platform.openai.com/docs/guides/embeddings/embedding-models#embedding-models"
                rel="noopener noreferrer"
                target="_blank"
              >
                OpenAI embedding models
              </a>{' '}
              for available models and dimensions.
            </p>
          )}

          {embeddingGen?.provider?.provider.case === 'cohere' && (
            <p className="-mt-2 mb-2 text-muted-foreground text-sm">
              See{' '}
              <a
                className="text-blue-500"
                href="https://docs.cohere.com/docs/cohere-embed"
                rel="noopener noreferrer"
                target="_blank"
              >
                Cohere embedding models
              </a>{' '}
              for available models and dimensions.
            </p>
          )}

          <FormItem>
            <FormLabel>Dimensions</FormLabel>
            <Input disabled value={embeddingGen?.dimensions?.toString() || 'Not configured'} />
          </FormItem>
          <FormItem>
            <FormLabel>API Key</FormLabel>
            <p className="mb-2 text-muted-foreground text-sm">
              All credentials are securely stored in your Secrets Store
            </p>
            <Input disabled value={embeddingGen?.provider?.provider.value?.apiKey || 'Not configured'} />
          </FormItem>
        </>
      )}
    </div>
  );
};
