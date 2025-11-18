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

import React from 'react';

import type { TabPropsWithSecrets } from './types';
import { SASLMechanism } from '../../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { SingleSelect } from '../../../../misc/select';
import { FormItem, FormLabel } from '../../../../redpanda-ui/components/form';
import { Input } from '../../../../redpanda-ui/components/input';
import { TopicSelector } from '../../topic-selector';
import { SecretDropdownField } from '../form-fields/secret-dropdown-field';
import { UserDropdown } from '../form-fields/user-dropdown';

export const IndexerTab = React.memo<TabPropsWithSecrets>(
  ({ knowledgeBase, isEditMode, formData, onUpdateFormData, onOpenAddSecret }) => {
    const indexer = knowledgeBase.indexer;

    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-semibold text-lg">Indexer</h2>
        {isEditMode ? (
          <>
            <div className="flex gap-4">
              <FormItem className="flex-1">
                <FormLabel>Chunk Size</FormLabel>
                <Input
                  onChange={(e) => onUpdateFormData('indexer.chunkSize', Number(e.target.value))}
                  type="number"
                  value={formData.indexer?.chunkSize || 512}
                />
              </FormItem>
              <FormItem className="flex-1">
                <FormLabel>Chunk Overlap</FormLabel>
                <Input
                  onChange={(e) => onUpdateFormData('indexer.chunkOverlap', Number(e.target.value))}
                  type="number"
                  value={formData.indexer?.chunkOverlap || 100}
                />
              </FormItem>
            </div>

            <TopicSelector
              onTopicsChange={(topics) => onUpdateFormData('indexer.inputTopics', topics)}
              selectedTopics={formData.indexer?.inputTopics || []}
            />

            <div className="flex gap-4">
              <div className="flex-1">
                <UserDropdown
                  helperText="Select from existing Redpanda users"
                  isRequired
                  label="Redpanda Username"
                  onChange={(value) => onUpdateFormData('indexer.redpandaUsername', value)}
                  value={formData.indexer?.redpandaUsername || ''}
                />
              </div>
              <div className="flex-1">
                <SecretDropdownField
                  helperText="All credentials are securely stored in your Secrets Store"
                  label="Redpanda Password"
                  onChange={(value) => onUpdateFormData('indexer.redpandaPassword', value)}
                  onCreateNew={() => onOpenAddSecret('indexer.redpandaPassword')}
                  placeholder="Enter password or select from secrets"
                  value={formData.indexer?.redpandaPassword || ''}
                />
              </div>
            </div>

            <FormItem>
              <FormLabel>
                SASL Mechanism
                <span className="ml-1 text-destructive">*</span>
              </FormLabel>
              <SingleSelect
                onChange={(value) => onUpdateFormData('indexer.redpandaSaslMechanism', value)}
                options={[
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256, label: 'SCRAM-SHA-256' },
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512, label: 'SCRAM-SHA-512' },
                ]}
                value={formData.indexer?.redpandaSaslMechanism || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256}
              />
            </FormItem>
          </>
        ) : (
          <>
            <div className="flex gap-4">
              <FormItem className="flex-1">
                <FormLabel>Chunk Size</FormLabel>
                <Input disabled type="number" value={indexer?.chunkSize || 512} />
              </FormItem>
              <FormItem className="flex-1">
                <FormLabel>Chunk Overlap</FormLabel>
                <Input disabled type="number" value={indexer?.chunkOverlap || 100} />
              </FormItem>
            </div>

            <TopicSelector isReadOnly={true} onTopicsChange={() => {}} selectedTopics={indexer?.inputTopics || []} />

            <div className="flex gap-4">
              <div className="flex-1">
                <UserDropdown
                  helperText="Select from existing Redpanda users"
                  isDisabled
                  isRequired
                  label="Redpanda Username"
                  onChange={() => {}}
                  value={indexer?.redpandaUsername || ''}
                />
              </div>
              <FormItem className="flex-1">
                <FormLabel className="font-medium">Redpanda Password</FormLabel>
                <p className="mb-2 text-muted-foreground text-sm">
                  All credentials are securely stored in your Secrets Store
                </p>
                <SingleSelect
                  isDisabled
                  onChange={() => {}}
                  options={[]}
                  placeholder="Password configured"
                  value={indexer?.redpandaPassword || ''}
                />
              </FormItem>
            </div>

            <FormItem>
              <FormLabel>SASL Mechanism</FormLabel>
              <SingleSelect
                isDisabled
                onChange={() => {}}
                options={[
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256, label: 'SCRAM-SHA-256' },
                  { value: SASLMechanism.SASL_MECHANISM_SCRAM_SHA_512, label: 'SCRAM-SHA-512' },
                ]}
                value={indexer?.redpandaSaslMechanism || SASLMechanism.SASL_MECHANISM_SCRAM_SHA_256}
              />
            </FormItem>
          </>
        )}
      </div>
    );
  }
);

IndexerTab.displayName = 'IndexerTab';
