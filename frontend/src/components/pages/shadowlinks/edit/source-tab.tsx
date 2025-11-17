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

import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { useFormContext } from 'react-hook-form';

import { AdvancedClientOptions } from '../create/connection/advanced-client-options';
import { BootstrapServers } from '../create/connection/bootstrap-servers';
import { ScramConfiguration } from '../create/connection/scram-configuration';
import type { FormValues } from '../create/model';

export const SourceTab = () => {
  const { control } = useFormContext<FormValues>();

  return (
    <div className="space-y-4">
      {/* Shadow link name (Read-only) */}
      <Card size="full">
        <CardHeader>Name</CardHeader>
        <CardContent>
          <FormField
            control={control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>Shadow link name</FormLabel>
                <FormControl>
                  <Input placeholder="my-shadow-link" {...field} disabled />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Source Cluster Connection and TLS */}
      <BootstrapServers />

      {/* SCRAM Credentials */}
      <ScramConfiguration />

      {/* Advanced Settings */}
      <AdvancedClientOptions />
    </div>
  );
};
