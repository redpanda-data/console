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
import type { ConnectError } from '@connectrpc/connect';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { KeyRound, Loader2, Plus } from 'lucide-react';
import { CreateSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
  type Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateSecretMutation } from 'react-query/api/secret';
import { toast } from 'sonner';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { z } from 'zod';

type SecretSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  availableSecrets: Array<{ id: string; name: string }>;
  placeholder?: string;
  onSecretCreated?: (secretId: string) => void;
  scopes: Scope[];
};

const NewSecretFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Secret name is required')
    .max(255, 'Secret name must be fewer than 255 characters')
    .regex(
      /^[A-Za-z][A-Za-z0-9_]*$/,
      'Secret name must start with a letter and contain only letters, numbers, and underscores'
    ),
  value: z
    .string()
    .min(1, 'Secret value is required')
    .regex(
      /^sk-(proj-)?[A-Za-z0-9-_]{20,}$/,
      'Invalid OpenAI API key format. Must start with "sk-" or "sk-proj-" followed by at least 20 alphanumeric characters'
    ),
});

type NewSecretFormData = z.infer<typeof NewSecretFormSchema>;

export const SecretSelector: React.FC<SecretSelectorProps> = ({
  value,
  onChange,
  availableSecrets,
  placeholder = 'Select from secrets store or create new',
  onSecretCreated,
  scopes,
}) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { mutateAsync: createSecret, isPending: isCreateSecretPending } = useCreateSecretMutation();

  const form = useForm<NewSecretFormData>({
    resolver: zodResolver(NewSecretFormSchema),
    defaultValues: {
      name: '',
      value: '',
    },
    mode: 'onChange', // Validate on change to show errors immediately
  });

  const handleCreateSecret = async (data: NewSecretFormData) => {
    try {
      const dataPlaneRequest = create(CreateSecretRequestSchemaDataPlane, {
        id: data.name,
        secretData: base64ToUInt8Array(encodeBase64(data.value)),
        scopes,
        labels: {},
      });

      await createSecret(
        create(CreateSecretRequestSchema, {
          request: dataPlaneRequest,
        })
      );

      toast.success(`Secret "${data.name}" created successfully`);

      // Select the newly created secret
      onChange(data.name);

      // Call callback if provided
      onSecretCreated?.(data.name);

      // Close dialog and reset form
      setIsCreateDialogOpen(false);
      form.reset();
    } catch (error) {
      const errorMessage = formatToastErrorMessageGRPC({
        error: error as ConnectError,
        action: 'create',
        entity: `secret ${data.name}`,
      });
      toast.error(errorMessage);
    }
  };

  return (
    <>
      {availableSecrets.length === 0 ? (
        // No secrets available - show empty state
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-muted border-dashed bg-muted/10 py-12">
          <KeyRound className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <Text className="mb-2 font-medium" variant="default">
            No Secrets Available
          </Text>
          <Text className="mb-4 text-center" variant="muted">
            Create a secret to securely store your OpenAI API key
          </Text>
          <Button onClick={() => setIsCreateDialogOpen(true)} variant="outline">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <Text as="span">Create Secret</Text>
            </div>
          </Button>
        </div>
      ) : (
        // Secrets available - show combobox with create button
        <div className="flex items-center gap-2">
          <Select onValueChange={onChange} value={value}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {availableSecrets.map((secret) => (
                <SelectItem key={secret.id} value={secret.id}>
                  {secret.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsCreateDialogOpen(true)} variant="outline">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <Text as="span">Create Secret</Text>
            </div>
          </Button>
        </div>
      )}

      <Dialog onOpenChange={setIsCreateDialogOpen} open={isCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Secret</DialogTitle>
            <DialogDescription>
              Create a new secret for your OpenAI API key. The secret will be stored securely.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form className="space-y-4" onSubmit={form.handleSubmit(handleCreateSecret)}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., OPENAI_API_KEY"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      />
                    </FormControl>
                    <FormDescription>Secrets are stored in uppercase</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Value</FormLabel>
                    <FormControl>
                      <Input placeholder="sk-..." type="password" {...field} />
                    </FormControl>
                    <FormDescription>Your OpenAI API key</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button onClick={() => setIsCreateDialogOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button disabled={isCreateSecretPending || !form.formState.isValid} type="submit">
                  {isCreateSecretPending ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <Text as="span">Creating...</Text>
                    </div>
                  ) : (
                    'Create Secret'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
};
