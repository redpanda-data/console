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
import { getRouteApi, useNavigate } from '@tanstack/react-router';

const routeApi = getRouteApi('/secrets/$id/edit');

import { TonedIcon } from 'components/pages/shared/toned-icon';
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
import { TagsFieldList } from 'components/ui/tag/tags-field-list';
import { AlertCircle, Loader2 } from 'lucide-react';
import { type Secret, UpdateSecretRequestSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useEffect } from 'react';
import { Controller, type Resolver, useFieldArray, useForm } from 'react-hook-form';
import { useGetSecretQuery, useUpdateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { uiState } from 'state/ui-state';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';

import { SecretUpdateFormSchema, type SecretUpdateFormValues } from './secret-edit-form-schema';
import { labelsToMap, SCOPE_OPTIONS } from '../secret-form-shared';

/** The console-managed `owner: console` label is hidden from the form. */
const toFormValues = (secret: Secret): SecretUpdateFormValues => ({
  id: secret.id,
  value: '',
  scopes: secret.scopes,
  labels: Object.entries(secret.labels)
    .filter(([key, value]) => !(key === 'owner' && value === 'console'))
    .map(([key, value]) => ({ key, value })),
});

const SecretEditForm = ({ secret }: { secret: Secret }) => {
  const navigate = useNavigate();
  const { mutateAsync: updateSecret, isPending: isUpdating } = useUpdateSecretMutation();

  const form = useForm<SecretUpdateFormValues>({
    resolver: zodResolver(SecretUpdateFormSchema) as Resolver<SecretUpdateFormValues>,
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
    form.reset(toFormValues(secret));
  }, [secret, form]);

  const onSubmit = async (values: SecretUpdateFormValues) => {
    const encodedSecretData = values.value ? base64ToUInt8Array(encodeBase64(values.value)) : new Uint8Array(0);

    const request = create(UpdateSecretRequestSchema, {
      id: values.id,
      secretData: encodedSecretData,
      scopes: values.scopes,
      labels: labelsToMap(values.labels),
    });

    try {
      await updateSecret({ request });
      toast.success('Secret updated');
      // Handled here so a navigation failure is not reported as a failed update.
      navigate({ to: '/secrets' }).catch((navigationError: unknown) => {
        toast.error('Failed to navigate', { description: String(navigationError) });
      });
    } catch (updateError) {
      const connectError = ConnectError.from(updateError);
      toast.error(formatToastErrorMessageGRPC({ error: connectError, action: 'update', entity: 'secret' }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <div className="text-body text-muted-foreground">
          Update the secret value, scopes, or labels. Leave the value empty to keep the existing secret.
        </div>
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
                      <MultiSelectItem key={option.value} label={option.label} value={option.value}>
                        <span className="flex items-center gap-2">
                          <option.icon className="size-4" />
                          {option.label}
                        </span>
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

        <div className="flex justify-start gap-3 pt-4">
          <Button
            data-testid="secret-edit-submit-button"
            disabled={!form.formState.isValid || isUpdating}
            type="submit"
          >
            {isUpdating ? (
              <>
                <TonedIcon className="h-4 w-4" icon={Loader2} spin />
                Updating...
              </>
            ) : (
              'Update Secret'
            )}
          </Button>
          <Button
            data-testid="secret-edit-cancel-button"
            onClick={() => navigate({ to: '/secrets' })}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export const SecretEditPage = () => {
  const { id } = routeApi.useParams();
  const navigate = useNavigate();

  const { data: secretData, isLoading, error } = useGetSecretQuery({ id: id || '' }, { enabled: Boolean(id) });
  const secret = secretData?.response?.secret;

  useEffect(() => {
    uiState.pageTitle = 'Edit Secret';
    uiState.pageBreadcrumbs.pop();
    uiState.pageBreadcrumbs.push({ title: 'Secrets Store', linkTo: '/secrets' });
    uiState.pageBreadcrumbs.push({ title: 'Edit', linkTo: `/secrets/${id}/edit` });
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex items-center gap-2">
          <TonedIcon className="h-6 w-6" icon={Loader2} spin />
          <div className="text-body">Loading secret...</div>
        </div>
      </div>
    );
  }

  if (error || !secret) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <TonedIcon className="h-12 w-12" icon={AlertCircle} tone="destructive" />
          <div className="text-center text-body">Secret not found or could not be loaded.</div>
          <Button onClick={() => navigate({ to: '/secrets' })} variant="outline">
            Go Back to Secrets
          </Button>
        </div>
      </div>
    );
  }

  return <SecretEditForm secret={secret} />;
};
