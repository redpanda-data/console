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

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Trash } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';

import { MtlsConfiguration } from './mtls-configuration';
import { TlsConfiguration } from './tls-configuration';
import type { FormValues } from '../model';

export const BootstrapServers = () => {
  const { control } = useFormContext<FormValues>();

  const {
    fields: bootstrapServerFields,
    append: appendBootstrapServer,
    remove: removeBootstrapServer,
  } = useFieldArray<FormValues>({
    control,
    name: 'bootstrapServers',
  });

  return (
    <Card data-testid="bootstrap-servers-card" size="full">
      <CardHeader>
        <CardTitle>Source cluster</CardTitle>
      </CardHeader>
      <CardContent>
        <FormLabel required>Bootstrap servers</FormLabel>
        {bootstrapServerFields.map((field, index) => (
          <div className="flex items-start gap-2" data-testid={`bootstrap-server-row-${index}`} key={field.id}>
            <FormField
              control={control}
              name={`bootstrapServers.${index}.value`}
              render={({ field: bootServer }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input placeholder="broker1:9092" testId={`bootstrap-server-input-${index}`} {...bootServer} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {bootstrapServerFields.length > 1 && (
              <Button
                data-testid={`delete-bootstrap-server-${index}`}
                onClick={() => removeBootstrapServer(index)}
                size="icon"
                type="button"
                variant="outline"
              >
                <Trash className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <Button
          data-testid="add-bootstrap-server-button"
          onClick={() => appendBootstrapServer({ value: '' })}
          size="sm"
          type="button"
          variant="outline"
        >
          Add URL
        </Button>

        <TlsConfiguration />

        <MtlsConfiguration />
      </CardContent>
    </Card>
  );
};
