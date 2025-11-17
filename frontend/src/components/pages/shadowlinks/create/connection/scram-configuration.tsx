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

import { Card, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Switch } from 'components/redpanda-ui/components/switch';
import { ScramMechanism } from 'protogen/redpanda/core/admin/v2/shadow_link_pb';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FormValues } from '../model';

export const ScramConfiguration = () => {
  const { control } = useFormContext<FormValues>();
  const useScram = useWatch({ control, name: 'useScram' });

  return (
    <Card size="full">
      <CardHeader>
        <CardTitle>Authentication</CardTitle>
      </CardHeader>
      <FormField
        control={control}
        name="useScram"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center gap-3">
            <FormLabel>Use SCRAM authentication</FormLabel>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} testId="scram-toggle" />
            </FormControl>
          </FormItem>
        )}
      />

      {useScram && (
        <div className="space-y-4" data-testid="scram-credentials-form">
          <FormField
            control={control}
            name="scramCredentials.username"
            render={({ field }) => (
              <FormItem data-testid="scram-username-field">
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input {...field} testId="scram-username-input" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="scramCredentials.password"
            render={({ field }) => (
              <FormItem data-testid="scram-password-field">
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input {...field} testId="scram-password-input" type="password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="scramCredentials.mechanism"
            render={({ field }) => (
              <FormItem data-testid="scram-mechanism-field">
                <FormLabel>SASL mechanism</FormLabel>
                <Select onValueChange={(value) => field.onChange(Number(value))} value={String(field.value)}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mechanism" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={String(ScramMechanism.SCRAM_SHA_256)}>SCRAM-SHA-256</SelectItem>
                    <SelectItem value={String(ScramMechanism.SCRAM_SHA_512)}>SCRAM-SHA-512</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </Card>
  );
};
