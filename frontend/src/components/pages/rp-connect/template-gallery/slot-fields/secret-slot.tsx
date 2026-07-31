/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { SimpleFormField } from 'components/redpanda-ui/components/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Control, FieldValues } from 'react-hook-form';
import { useListSecretsQuery } from 'react-query/api/secret';

import { AddSecretsDialog } from '../../onboarding/add-secrets-dialog';
import type { SecretSlot } from '../pipeline-template-types';

export type SecretSlotFieldProps = {
  slot: SecretSlot;
  control: Control<FieldValues>;
  onSecretCreated?: (slotId: string, secretName: string) => void;
  // When supplied, "Create secret" delegates to the parent instead of opening
  // the nested AddSecretsDialog (avoids dialog-within-a-dialog). The existing-
  // secret select stays in the slot regardless.
  onRequestCreateSecret?: (slotId: string, suggestedName: string | undefined) => void;
};

export const SecretSlotField = ({ slot, control, onSecretCreated, onRequestCreateSecret }: SecretSlotFieldProps) => {
  const { data: secretsResponse, refetch } = useListSecretsQuery({}, { enabled: true });
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const existingSecrets = useMemo(
    () => (secretsResponse?.secrets ?? []).map((s) => s?.id ?? '').filter(Boolean),
    [secretsResponse]
  );

  const requiredSecretsForDialog = useMemo(
    () => (slot.suggestedName ? [slot.suggestedName] : ['NEW_SECRET']),
    [slot.suggestedName]
  );

  const handleCreateClick = () => {
    if (onRequestCreateSecret) {
      onRequestCreateSecret(slot.id, slot.suggestedName);
      return;
    }
    setIsDialogOpen(true);
  };

  return (
    <>
      <SimpleFormField
        control={control}
        description={slot.description}
        label={slot.label}
        name={slot.id}
        required={slot.required}
      >
        {(field) => {
          // Include a just-created value the listSecrets query hasn't reported
          // yet, so the Select shows it instead of the placeholder.
          const selectedValue = (field.value as string | undefined) ?? '';
          const options =
            selectedValue && !existingSecrets.includes(selectedValue)
              ? [selectedValue, ...existingSecrets]
              : existingSecrets;
          return (
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <div className="flex-1">
                <Select onValueChange={field.onChange} value={selectedValue}>
                  <SelectTrigger data-testid={`slot-${slot.id}`}>
                    {/* Render-prop child sidesteps Base UI resolving the label only after the
                        popup first mounts, which would hide the auto-selected secret. */}
                    <SelectValue placeholder="Select an existing secret...">
                      {(value) => (typeof value === 'string' && value !== '' ? value : null)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.length === 0 ? (
                      <div className="px-3 py-2 text-muted-foreground text-sm">No secrets yet</div>
                    ) : (
                      options.map((secretId) => (
                        <SelectItem key={secretId} value={secretId}>
                          {secretId}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                data-testid={`slot-${slot.id}-create`}
                onClick={handleCreateClick}
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" /> Create secret
              </Button>
            </div>
          );
        }}
      </SimpleFormField>
      {onRequestCreateSecret ? null : (
        <AddSecretsDialog
          existingSecrets={existingSecrets}
          isOpen={isDialogOpen}
          missingSecrets={requiredSecretsForDialog}
          onClose={() => setIsDialogOpen(false)}
          onSecretsCreated={(secretNames) => {
            setIsDialogOpen(false);
            refetch();
            const created = secretNames?.[0];
            if (created) {
              onSecretCreated?.(slot.id, created);
            }
          }}
        />
      )}
    </>
  );
};
