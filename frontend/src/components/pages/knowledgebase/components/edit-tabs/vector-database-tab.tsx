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

export const VectorDatabaseTab = ({
  knowledgeBase,
  isEditMode,
  formData,
  onUpdateFormData,
  onOpenAddSecret,
}: TabPropsWithSecrets) => {
  const postgres =
    knowledgeBase.vectorDatabase?.vectorDatabase.case === 'postgres'
      ? knowledgeBase.vectorDatabase.vectorDatabase.value
      : null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-semibold text-lg">Vector Database</h2>

      {isEditMode ? (
        <SecretDropdownField
          helperText="All credentials are securely stored in your Secrets Store"
          isRequired
          label="PostgreSQL DSN"
          onChange={(value) => onUpdateFormData('vectorDatabase.vectorDatabase.value.dsn', value)}
          onCreateNew={() => onOpenAddSecret('vectorDatabase.vectorDatabase.value.dsn')}
          placeholder="postgresql://user:password@host:port/database"
          value={
            formData.vectorDatabase?.vectorDatabase.case === 'postgres'
              ? formData.vectorDatabase.vectorDatabase.value.dsn
              : ''
          }
        />
      ) : (
        <div>
          <p className="mb-1 font-medium text-gray-700 text-sm">PostgreSQL DSN</p>
          <p className="mb-2 text-muted-foreground text-sm">
            All credentials are securely stored in your Secrets Store
          </p>
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
            <p className="text-gray-900 text-sm">{postgres?.dsn || 'Not configured'}</p>
          </div>
        </div>
      )}

      {postgres && (
        <FormItem>
          <FormLabel>Table Name</FormLabel>
          <p className="mb-2 text-muted-foreground text-sm">Table name cannot be changed after creation.</p>
          <Input disabled value={postgres.table} />
        </FormItem>
      )}
    </div>
  );
};
