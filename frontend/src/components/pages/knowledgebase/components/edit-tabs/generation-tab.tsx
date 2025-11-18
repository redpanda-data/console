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

export const GenerationTab = ({
  knowledgeBase,
  isEditMode,
  onUpdateFormData,
  onOpenAddSecret,
}: TabPropsWithSecrets) => {
  const generation = knowledgeBase.generation;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">Generation</h2>
      <p className="text-gray-600 text-sm">
        The Generation provider is used to generate the final response in the chat endpoint.
      </p>

      {isEditMode ? (
        <>
          <h3 className="font-semibold text-md">
            {generation?.provider?.provider.case === 'openai' ? 'OpenAI' : 'OpenAI'} Configuration
          </h3>

          <FormItem>
            <FormLabel>Model</FormLabel>
            <Input disabled value={generation?.model || ''} />
          </FormItem>

          <SecretDropdownField
            helperText="OpenAI API key for authentication"
            isRequired
            label="API Key"
            onChange={(value) => {
              onUpdateFormData('generation.provider.provider.value.apiKey', value);
            }}
            onCreateNew={() => onOpenAddSecret('generation.provider.provider.value.apiKey')}
            value={generation?.provider?.provider.case === 'openai' ? generation.provider.provider.value.apiKey : ''}
          />
        </>
      ) : (
        <>
          <h3 className="font-semibold text-md">
            {generation?.provider?.provider.case === 'openai' ? 'OpenAI' : 'OpenAI'} Configuration
          </h3>

          <FormItem>
            <FormLabel>Model</FormLabel>
            <Input disabled value={generation?.model || ''} />
          </FormItem>

          <FormItem>
            <FormLabel>API Key</FormLabel>
            <Input
              disabled
              value={generation?.provider?.provider.case === 'openai' ? generation.provider.provider.value.apiKey : ''}
            />
          </FormItem>
        </>
      )}
    </div>
  );
};
