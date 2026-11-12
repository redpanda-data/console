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

import type { ConnectError } from '@connectrpc/connect';
import { FormDescription, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectTrigger,
  MultiSelectValue,
} from 'components/redpanda-ui/components/multi-select';
import { useEffect, useMemo, useReducer } from 'react';
import { useFormContext } from 'react-hook-form';
import { useControlplaneListServerlessEgressGatewaysQuery } from 'react-query/api/controlplane/serverless-egress-gateway';

import type { EgressGatewayNames } from './changes-summary';
import { egressGatewayOptions, isEgressGatewayPickerEnabled } from './egress-gateways';

/** Names of the gateways this cluster's pipelines can use, by ID; empty unless the picker is enabled. */
export function useEgressGatewayNames(): EgressGatewayNames {
  const { gateways } = useControlplaneListServerlessEgressGatewaysQuery({ enabled: isEgressGatewayPickerEnabled() });
  return useMemo(() => new Map((gateways ?? []).map((gateway) => [gateway.id, gateway.displayName])), [gateways]);
}

/** A failed list must not read as an empty one; the selection stays, labelled by ID. */
function LoadError({ error }: { error: ConnectError | null }) {
  return error ? (
    <p className="text-sm text-destructive">Couldn't load egress gateways: {error.rawMessage || error.message}</p>
  ) : null;
}

/** The settings form's egress gateways field. Renders nothing unless the picker is enabled. */
export function EgressGatewayField({ readonly }: { readonly?: boolean }) {
  const { control, watch } = useFormContext();
  const isEnabled = isEgressGatewayPickerEnabled();
  const { gateways, isLoading, error } = useControlplaneListServerlessEgressGatewaysQuery({ enabled: isEnabled });

  // The select's chips read labels its items cache in their effects, after the render that showed the
  // chips; render once more when the gateways arrive so the chips show names rather than IDs.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    if (gateways) {
      rerender();
    }
  }, [gateways]);

  if (!isEnabled) {
    return null;
  }

  const selectedIds = (watch('egressGatewayIds') ?? []) as string[];
  const options = egressGatewayOptions(gateways, selectedIds);

  return (
    <FormField
      control={control}
      name="egressGatewayIds"
      render={({ field }) => {
        if (readonly) {
          const selected = options.filter((option) => selectedIds.includes(option.id));
          return (
            <FormItem>
              <FormLabel>Egress gateways</FormLabel>
              <p className="text-body text-muted-foreground">
                {selected.length > 0 ? selected.map((option) => option.label).join(', ') : 'None'}
              </p>
              <LoadError error={error} />
            </FormItem>
          );
        }

        return (
          <FormItem>
            <FormLabel>Egress gateways</FormLabel>
            <MultiSelect onValueChange={field.onChange} value={field.value ?? []}>
              <MultiSelectTrigger className="w-full">
                <MultiSelectValue
                  placeholder={isLoading ? 'Loading egress gateways...' : 'Select egress gateways...'}
                />
              </MultiSelectTrigger>
              <MultiSelectContent>
                <MultiSelectList>
                  {options.map((option) => (
                    <MultiSelectItem key={option.id} label={option.label} value={option.id}>
                      <span>{option.label}</span>
                      {option.label === option.id ? null : (
                        <span className="ml-2 text-xs text-muted-foreground">{option.id}</span>
                      )}
                    </MultiSelectItem>
                  ))}
                  <MultiSelectEmpty>No available egress gateways</MultiSelectEmpty>
                </MultiSelectList>
              </MultiSelectContent>
            </MultiSelect>
            <LoadError error={error} />
            <FormDescription>
              Gateways the pipeline reaches private endpoints through. Only available gateways can be added.
            </FormDescription>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
