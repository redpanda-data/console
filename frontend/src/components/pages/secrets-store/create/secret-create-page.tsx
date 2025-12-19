/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License,
 * use of this software will be governed by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from 'components/redpanda-ui/components/multi-select';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import { Loader2 } from 'lucide-react';
import { runInAction } from 'mobx';
import { CreateSecretRequestSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useCreateSecretMutation, useListSecretsQuery } from 'react-query/api/secret';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

import { initialValues, SecretCreateFormSchema, type SecretCreateFormValues } from './secret-create-form-schema';
import { SCOPE_OPTIONS } from '../secret-form-shared';

export const SecretCreatePage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createSecret, isPending: isCreating } = useCreateSecretMutation();
  const { data: secretList } = useListSecretsQuery();

  const form = useForm<SecretCreateFormValues>({
    resolver: zodResolver(SecretCreateFormSchema),
    defaultValues: initialValues,
    mode: 'onChange',
  });

  const {
    fields: labelFields,
    append: appendLabel,
    remove: removeLabel,
  } = useFieldArray({
    control: form.control,
    name: 'labels',
  });

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Create Secret';
      uiState.pageBreadcrumbs.pop();
      uiState.pageBreadcrumbs.push({ title: 'Secrets Store', linkTo: '/secrets' });
      uiState.pageBreadcrumbs.push({ title: 'Create', linkTo: '/secrets/create' });
    });
  }, []);

  const onSubmit = async (values: SecretCreateFormValues) => {
    const labelsMap: { [key: string]: string } = {};
    for (const label of values.labels) {
      if (label.key && label.value) {
        labelsMap[label.key] = label.value;
      }
    }

    const request = create(CreateSecretRequestSchema, {
      id: values.id,
      secretData: base64ToUInt8Array(encodeBase64(values.value)),
      scopes: values.scopes,
      labels: labelsMap,
    });

    try {
      await createSecret({ request });
      toast.success('Secret created successfully');
      navigate('/secrets');
    } catch (error) {
      const connectError = ConnectError.from(error);
      toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'create', entity: 'secret' }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <Heading level={1}>Create Secret</Heading>
        <Text variant="muted">Create a new secret that can be securely accessed by your services.</Text>
      </header>

      <form className="max-w-full space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Controller
          control={form.control}
          name="id"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>ID</FieldLabel>
              <Input
                {...field}
                data-testid="secret-id-input"
                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                placeholder="SECRET_ID"
              />
              <FieldDescription>
                ID must use uppercase letters, numbers, underscores, slashes, and hyphens only.
              </FieldDescription>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
          rules={{
            validate: (value) =>
              secretList?.secrets?.some((secret) => secret?.id === value) ? 'ID is already in use' : undefined,
          }}
        />

        <Controller
          control={form.control}
          name="value"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Value</FieldLabel>
              <Input {...field} data-testid="secret-value-input" placeholder="Enter secret value" type="password" />
              <FieldDescription>The secret value will be encrypted and cannot be retrieved later.</FieldDescription>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="scopes"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel required>Scopes</FieldLabel>
              <MultiSelect
                onValueChange={(values) => field.onChange(values.map(Number))}
                value={field.value.map(String)}
              >
                <MultiSelectTrigger className="w-full" data-testid="secret-scopes-select">
                  <MultiSelectValue placeholder="Select scopes" />
                </MultiSelectTrigger>
                <MultiSelectContent>
                  <MultiSelectList>
                    {SCOPE_OPTIONS.map((option) => (
                      <MultiSelectItem key={option.value} {...option}>
                        {option.label}
                      </MultiSelectItem>
                    ))}
                  </MultiSelectList>
                  <MultiSelectEmpty>No items found</MultiSelectEmpty>
                </MultiSelectContent>
              </MultiSelect>
              <FieldDescription>Select which resources can access this secret.</FieldDescription>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <TagsFieldList
          appendTag={appendLabel}
          fieldName="labels"
          form={form}
          removeTag={removeLabel}
          tagFields={labelFields}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button
            data-testid="secret-create-cancel-button"
            onClick={() => navigate('/secrets')}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            data-testid="secret-create-submit-button"
            disabled={!form.formState.isValid || isCreating}
            type="submit"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Secret'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
