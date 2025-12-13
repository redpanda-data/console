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

import { FormControl, FormField, FormItem, FormLabel } from 'components/redpanda-ui/components/form';
import { Switch } from 'components/redpanda-ui/components/switch';
import { useFormContext } from 'react-hook-form';

import type { FormValues } from '../model';

export const TlsConfiguration = () => {
  const { control } = useFormContext<FormValues>();
  return (
    <div className="space-y-4" data-testid="tls-configuration">
      <FormField
        control={control}
        name="useTls"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-3">
            <FormLabel>Enable TLS</FormLabel>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} testId="tls-toggle" />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
};
