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
import { Text } from 'components/redpanda-ui/components/typography';
import { useFormContext, useWatch } from 'react-hook-form';

import type { FormValues } from '../model';

const TLS_DOCS_URL =
  'https://docs.redpanda.com/current/manage/disaster-recovery/shadowing/setup/#network-and-authentication';

export const TlsConfiguration = () => {
  const { control } = useFormContext<FormValues>();
  const useTls = useWatch({ control, name: 'useTls' });

  return (
    <div className="space-y-3" data-testid="tls-configuration">
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

      {useTls && (
        <Text data-testid="tls-intro" variant="muted">
          The connection to the source cluster is encrypted. By default, its certificate is verified using the system
          trust store. Upload a custom CA below if the source uses a private or self-signed CA.{' '}
          <a className="text-primary hover:underline" href={TLS_DOCS_URL} rel="noreferrer" target="_blank">
            Learn about TLS for shadow links
          </a>
        </Text>
      )}
    </div>
  );
};
