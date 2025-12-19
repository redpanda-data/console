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
import { AlertCircle, Loader2 } from 'lucide-react';
import { runInAction } from 'mobx';
import { UpdateSecretRequestSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useGetSecretQuery, useUpdateSecretMutation } from 'react-query/api/secret';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

import { SCOPE_OPTIONS, SecretUpdateFormSchema, type SecretUpdateFormValues } from './secret-edit-form-schema';

export const SecretEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: secretData, isLoading, error } = useGetSecretQuery({ id: id || '' }, { enabled: Boolean(id) });
  const secret = secretData?.response?.secret;

  const { mutateAsync: updateSecret, isPending: isUpdating } = useUpdateSecretMutation();

  const form = useForm<SecretUpdateFormValues>({
    resolver: zodResolver(SecretUpdateFormSchema),
    defaultValues: {
      id: '',
      value: '',
      scopes: [],
      labels: [],
    },
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
    if (secret) {
      const existingLabels = secret.labels
        ? Object.entries(secret.labels)
            .filter(([key, value]) => !(key === 'owner' && value === 'console'))
            .map(([key, value]) => ({ key, value }))
        : [];

      form.reset({
        id: secret.id,
        value: '',
        scopes: secret.scopes,
        labels: existingLabels.length > 0 ? existingLabels : [],
      });
    }
  }, [secret, form]);

  useEffect(() => {
    runInAction(() => {
      uiState.pageTitle = 'Edit Secret';
      uiState.pageBreadcrumbs.pop();
      uiState.pageBreadcrumbs.push({ title: 'Secrets Store', linkTo: '/secrets' });
      uiState.pageBreadcrumbs.push({ title: 'Edit', linkTo: `/secrets/${id}/edit` });
    });
  }, [id]);

  const onSubmit = async (values: SecretUpdateFormValues) => {
    const labelsMap: { [key: string]: string } = {};
    for (const label of values.labels) {
      if (label.key && label.value) {
        labelsMap[label.key] = label.value;
      }
    }

    const encodedSecretData = values.value ? base64ToUInt8Array(encodeBase64(values.value)) : new Uint8Array(0);

    const request = create(UpdateSecretRequestSchema, {
      id: values.id,
      secretData: encodedSecretData,
      scopes: values.scopes,
      labels: labelsMap,
    });

    try {
      await updateSecret({ request });
      toast.success('Secret updated successfully');
      navigate('/secrets');
    } catch (updateError) {
      const connectError = ConnectError.from(updateError);
      toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'update', entity: 'secret' }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <Text>Loading secret...</Text>
        </div>
      </div>
    );
  }

  if (error || !secret) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="h-12 w-12 text-red-600" />
          <Text className="text-center">Secret not found or could not be loaded.</Text>
          <Button onClick={() => navigate('/secrets')} variant="outline">
            Go Back to Secrets
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <Heading level={1}>Update Secret</Heading>
        <Text variant="muted">
          Update the secret value, scopes, or labels. Leave the value empty to keep the existing secret.
        </Text>
      </header>

      <form className="max-w-full space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Controller
          control={form.control}
          name="id"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>ID</FieldLabel>
              <Input {...field} disabled />
              <FieldDescription>Secret identifier cannot be changed.</FieldDescription>
              {Boolean(fieldState.invalid) && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          control={form.control}
          name="value"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel>Value</FieldLabel>
              <Input {...field} placeholder="Leave empty to keep existing value" type="password" />
              <FieldDescription>
                Enter a new value to update the secret, or leave empty to keep the existing value.
              </FieldDescription>
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
            data-testid="secret-edit-cancel-button"
            onClick={() => navigate('/secrets')}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            data-testid="secret-edit-submit-button"
            disabled={!form.formState.isValid || isUpdating}
            type="submit"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Secret'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};
