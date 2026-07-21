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

import { create } from '@bufbuild/protobuf';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { type FC, useEffect, useState } from 'react';
import { Controller, type SubmitHandler, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { setMonacoTheme } from '../../../config';
import {
  CompressionType,
  CompressionTypeSchema,
  KafkaRecordHeaderSchema,
  PayloadEncoding,
} from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  PublishMessagePayloadOptionsSchema,
  PublishMessageRequestSchema,
} from '../../../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import { setPageHeader, uiState } from '../../../state/ui-state';
import { base64ToUInt8Array, isValidBase64, substringWithEllipsis } from '../../../utils/utils';
import KowlEditor from '../../misc/kowl-editor';
import { Alert, AlertDescription } from '../../redpanda-ui/components/alert';
import { Button } from '../../redpanda-ui/components/button';
import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '../../redpanda-ui/components/field';
import { Input } from '../../redpanda-ui/components/input';
import { KeyValueField } from '../../redpanda-ui/components/key-value-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../redpanda-ui/components/select';

type EncodingOption = {
  value: PayloadEncoding | 'base64';
  label: string;
  tooltip: string; // React.ReactNode | (() => React.ReactNode),
};
const encodingOptions: EncodingOption[] = [
  {
    value: PayloadEncoding.NULL,
    label: 'Null',
    tooltip: 'Message value will be null',
  },
  {
    value: PayloadEncoding.TEXT,
    label: 'Text',
    tooltip: 'Text in the editor will be encoded to UTF-8 bytes',
  },
  {
    value: PayloadEncoding.JSON,
    label: 'JSON',
    tooltip: 'Syntax higlighting for JSON, otherwise the same as text',
  },

  {
    value: PayloadEncoding.AVRO,
    label: 'Avro',
    tooltip: 'The given JSON will be serialized using the selected schema',
  },
  // We hide Protobuf until we can provide a better UX with selecting types rather than having users
  // specify an index that points to the type within the proto schema.
  // {value: PayloadEncoding.PROTOBUF, label: 'Protobuf', tooltip: 'The given JSON will be serialized using the selected schema'},

  {
    value: PayloadEncoding.BINARY,
    label: 'Binary (Base64)',
    tooltip: 'Message value is binary, represented as a base64 string in the editor',
  },
];

const protoBufInfoElement = (
  <p className="text-body-sm">
    Protobuf schemas can define multiple types. Specify which type you want to use for this message.{' '}
    <a href="https://protobuf.dev/reference/protobuf/google.protobuf/" rel="noopener noreferrer" target="_blank">
      Learn more here.
    </a>
  </p>
);

function encodingToLanguage(encoding: PayloadEncoding) {
  if (encoding === PayloadEncoding.AVRO) {
    return 'json';
  }
  if (encoding === PayloadEncoding.JSON) {
    return 'json';
  }
  if (encoding === PayloadEncoding.PROTOBUF) {
    return 'protobuf';
  }
  if (encoding === PayloadEncoding.BINARY) {
    return 'plaintext';
  }
  return;
}

// Numeric-valued select wrapper bridging the registry Select (string values) with
// react-hook-form fields that hold numeric enums (partition, compression, encoding, version).
function NumberSelect({
  value,
  onChange,
  options,
  testId,
  placeholder,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  options: { label: React.ReactNode; value: number }[];
  testId?: string;
  placeholder?: string;
}) {
  return (
    <Select onValueChange={(raw) => onChange(Number(raw))} value={value === undefined ? undefined : String(value)}>
      <SelectTrigger testId={testId}>
        <SelectValue placeholder={placeholder}>
          {(raw) => options.find((o) => String(o.value) === raw)?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={String(o.value)}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const payloadOptionsSchema = z.object({
  encoding: z.nativeEnum(PayloadEncoding),
  data: z.string(),
  schemaName: z.string().optional(),
  schemaVersion: z.number().optional(),
  schemaId: z.number().optional(),
  protobufIndex: z.number().optional(),
});

const produceRecordSchema = z
  .object({
    partition: z.number(),
    compressionType: z.nativeEnum(CompressionType),
    headers: z.array(z.object({ key: z.string(), value: z.string() })),
    key: payloadOptionsSchema,
    value: payloadOptionsSchema,
  })
  .superRefine((data, ctx) => {
    if (data.key.encoding === PayloadEncoding.BINARY && !isValidBase64(data.key.data)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Base64 format', path: ['key', 'data'] });
    }
    if (data.value.encoding === PayloadEncoding.BINARY && !isValidBase64(data.value.data)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Base64 format', path: ['value', 'data'] });
    }
  });

type Inputs = z.infer<typeof produceRecordSchema>;

const persistCompressionType = (compressionType: CompressionType) => {
  uiState.topicSettings.produceRecordCompression = compressionType;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
const PublishTopicForm: FC<{ topicName: string }> = ({ topicName }) => {
  const {
    control,
    register,
    setValue,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<Inputs>({
    resolver: zodResolver(produceRecordSchema),
    mode: 'onChange',
    defaultValues: {
      partition: -1,
      compressionType: uiState.topicSettings.produceRecordCompression,
      headers: [],
      key: {
        data: '',
        encoding: PayloadEncoding.TEXT,
      },
      value: {
        data: '',
        encoding: PayloadEncoding.TEXT,
      },
    },
  });

  const keyPayloadOptions = useWatch({ control, name: 'key' });
  const valuePayloadOptions = useWatch({ control, name: 'value' });

  const [isKeyExpanded, setKeyExpanded] = useState(false);

  const showKeySchemaSelection =
    keyPayloadOptions.encoding === PayloadEncoding.AVRO || keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF;
  const showValueSchemaSelection =
    valuePayloadOptions.encoding === PayloadEncoding.AVRO || valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF;

  const compressionTypes = CompressionTypeSchema.values
    .filter((value) => value.number !== CompressionType.UNSPECIFIED)
    .map((value) => ({
      label: value.localName,
      value: value.number as CompressionType,
    }));

  const topics = useApiStoreHook((s) => s.topics);
  const availablePartitions = (() => {
    const partitions: { label: string; value: number }[] = [{ label: 'Auto (Murmur2)', value: -1 }];

    const count = topics?.first((t) => t.topicName === topicName)?.partitionCount;
    if (count === undefined) {
      // topic not found
      return partitions;
    }

    if (count === 1) {
      // only one partition to select
      return partitions;
    }

    for (let i = 0; i < count; i++) {
      partitions.push({ label: `Partition ${i}`, value: i });
    }

    return partitions;
  })();

  const schemaSubjects = useApiStoreHook((s) => s.schemaSubjects);
  const availableValues = schemaSubjects?.filter((x) => !x.isSoftDeleted) ?? [];

  const keySchemaName = useWatch({ control, name: 'key.schemaName' });
  const valueSchemaName = useWatch({ control, name: 'value.schemaName' });
  const keySchemaDetail = useApiStoreHook((s) => (keySchemaName ? s.schemaDetails.get(keySchemaName) : undefined));
  const valueSchemaDetail = useApiStoreHook((s) =>
    valueSchemaName ? s.schemaDetails.get(valueSchemaName) : undefined
  );

  // biome-ignore lint/complexity: This will be refactored anyway as part of MobX removal
  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const req = create(PublishMessageRequestSchema);
    req.topic = topicName;
    req.partitionId = data.partition;
    req.compression = data.compressionType;

    persistCompressionType(data.compressionType);

    // Headers
    for (const h of data.headers) {
      if (!(h.value || h.value)) {
        continue;
      }
      const kafkaHeader = create(KafkaRecordHeaderSchema);
      kafkaHeader.key = h.key;
      kafkaHeader.value = new TextEncoder().encode(h.value);
      req.headers.push(kafkaHeader);
    }

    const encodeData = (payloadData: string, encoding: PayloadEncoding): Uint8Array => {
      if (encoding === PayloadEncoding.BINARY) {
        // This will throw an exception if data is not base64.
        // We want to catch exceptions so that we can show an error.
        window.atob(payloadData);
        return base64ToUInt8Array(payloadData);
      }

      return new TextEncoder().encode(payloadData);
    };

    // Key
    if (data.key.encoding !== PayloadEncoding.NULL) {
      req.key = create(PublishMessagePayloadOptionsSchema);
      try {
        req.key.data = encodeData(data.key.data, data.key.encoding);
      } catch (err) {
        // TODO: Handle error
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(err);
        return;
      }
      req.key.data = encodeData(data.key.data, data.key.encoding);
      req.key.encoding = data.key.encoding;

      // Determine schemaId from schemaVersion if schema is selected and encoding is Avro or Protobuf
      if (
        (data.key.encoding === PayloadEncoding.AVRO || data.key.encoding === PayloadEncoding.PROTOBUF) &&
        data.key.schemaName &&
        data.key.schemaVersion
      ) {
        const schemaDetail = api.schemaDetails.get(data.key.schemaName);
        if (schemaDetail) {
          const selectedSchema = schemaDetail.schemas.find(
            (schema) => schema.version === data.key.schemaVersion && !schema.isSoftDeleted
          );
          if (selectedSchema) {
            req.key.schemaId = selectedSchema.id;
          }
        }
      }

      if (data.key.protobufIndex !== undefined) {
        req.key.index = data.key.protobufIndex;
      }
    }

    // Value
    if (data.value.encoding !== PayloadEncoding.NULL) {
      req.value = create(PublishMessagePayloadOptionsSchema);
      try {
        req.value.data = encodeData(data.value.data, data.value.encoding);
      } catch (err) {
        // TODO: Handle error
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(err);
        return;
      }
      req.value.encoding = data.value.encoding;

      // Determine schemaId from schemaVersion if schema is selected and encoding is Avro or Protobuf
      if (
        (data.value.encoding === PayloadEncoding.AVRO || data.value.encoding === PayloadEncoding.PROTOBUF) &&
        data.value.schemaName &&
        data.value.schemaVersion
      ) {
        const schemaDetail = api.schemaDetails.get(data.value.schemaName);
        if (schemaDetail) {
          const selectedSchema = schemaDetail.schemas.find(
            (schema) => schema.version === data.value.schemaVersion && !schema.isSoftDeleted
          );
          if (selectedSchema) {
            req.value.schemaId = selectedSchema.id;
          }
        }
      }

      if (data.value.protobufIndex !== undefined) {
        req.value.index = data.value.protobufIndex;
      }
    }

    const result = await api.publishMessage(req).catch((err) => {
      setError('root.serverError', {
        message: err.rawMessage,
      });
    });

    if (result) {
      toast.success(`Record published on partition ${result.partitionId} with offset ${Number(result.offset)}`);
      appGlobal.historyPush(`/topics/${encodeURIComponent(topicName)}`);
    }
  };

  const filteredEncodingOptions = encodingOptions
    .filter((x) => x.value !== PayloadEncoding.AVRO)
    .map((x) => ({ label: x.label, value: x.value as number }));

  const schemaNameOptions = availableValues.map((schema) => ({ label: schema.name, value: schema.name }));

  const sortedKeyVersions =
    keySchemaDetail?.versions
      .slice()
      .sort(({ version: version1 }, { version: version2 }) => version2 - version1)
      .map(({ version }) => ({ label: version, value: version })) ?? [];

  const sortedValueVersions =
    valueSchemaDetail?.versions
      .slice()
      .sort(({ version: version1 }, { version: version2 }) => version2 - version1)
      .map(({ version }) => ({ label: version, value: version })) ?? [];

  return (
    <form className="flex w-full max-w-[600px] flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-row gap-4">
        <Controller
          control={control}
          name="partition"
          render={({ field }) => (
            <Field className="flex-1">
              <FieldLabel htmlFor="partition">Partition</FieldLabel>
              <NumberSelect onChange={field.onChange} options={availablePartitions} value={field.value} />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="compressionType"
          render={({ field }) => (
            <Field className="flex-1">
              <FieldLabel htmlFor="compressionType">Compression Type</FieldLabel>
              <NumberSelect onChange={field.onChange} options={compressionTypes} value={field.value} />
            </Field>
          )}
        />
      </div>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>Headers</FieldLegend>
        <Controller
          control={control}
          name="headers"
          render={({ field }) => (
            <KeyValueField
              addButtonLabel="Add row"
              onChange={field.onChange}
              testId="produce-headers"
              value={field.value}
            />
          )}
        />
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>Key</FieldLegend>
        <div className="grid grid-cols-5 gap-2">
          <Controller
            control={control}
            name="key.encoding"
            render={({ field }) => (
              <Field className="col-span-2">
                <FieldLabel htmlFor="key.encoding">Type</FieldLabel>
                <NumberSelect onChange={field.onChange} options={filteredEncodingOptions} value={field.value} />
              </Field>
            )}
          />
          {Boolean(showKeySchemaSelection) && (
            <Controller
              control={control}
              name="key.schemaName"
              render={({ field }) => (
                <Field className="col-span-2">
                  <FieldLabel htmlFor="key.schemaName">Schema</FieldLabel>
                  <Select
                    onValueChange={(newVal) => {
                      field.onChange(newVal);

                      if (newVal) {
                        // Fetch schema details to get available versions
                        api
                          .refreshSchemaDetails(newVal)
                          .then(() => {
                            const detail = api.schemaDetails.get(newVal);
                            if (detail?.latestActiveVersion) {
                              setValue('key.schemaVersion', detail.latestActiveVersion);
                            }
                          })
                          .catch(() => {
                            // Error handling managed by API layer
                          });
                      }
                    }}
                    value={field.value}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {schemaNameOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          )}
          {Boolean(showKeySchemaSelection) && (
            <Controller
              control={control}
              name="key.schemaVersion"
              render={({ field }) => (
                <Field className="col-span-1">
                  <FieldLabel htmlFor="key.schemaVersion">Version</FieldLabel>
                  <NumberSelect onChange={field.onChange} options={sortedKeyVersions} value={field.value} />
                </Field>
              )}
            />
          )}
        </div>

        {keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF && (
          <Field>
            <FieldLabel htmlFor="key.protobufIndex">Index</FieldLabel>
            {protoBufInfoElement}
            <Input id="key.protobufIndex" type="number" {...register('key.protobufIndex', { valueAsNumber: true })} />
          </Field>
        )}

        {keyPayloadOptions.encoding !== PayloadEncoding.NULL && (
          <Field data-invalid={!!errors.key?.data}>
            <FieldLabel>Data</FieldLabel>
            <div data-testid="produce-key-editor">
              {isKeyExpanded ? (
                <Controller
                  control={control}
                  name="key.data"
                  render={({ field: { onChange, value } }) => (
                    <KowlEditor
                      height={300}
                      language={encodingToLanguage(keyPayloadOptions?.encoding)}
                      onChange={onChange}
                      onMount={setMonacoTheme}
                      value={value}
                    />
                  )}
                />
              ) : (
                <Controller
                  control={control}
                  name="key.data"
                  render={({ field: { onChange, value } }) => <Input onChange={onChange} value={value} />}
                />
              )}
              <Button className="mt-1 px-0" onClick={() => setKeyExpanded(!isKeyExpanded)} size="sm" variant="link">
                {isKeyExpanded ? 'Collapse' : 'Expand'}
              </Button>
            </div>
            {Boolean(errors.key?.data) && <FieldError>{errors.key?.data?.message}</FieldError>}
          </Field>
        )}
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend>Value</FieldLegend>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-5 gap-2">
            <Controller
              control={control}
              name="value.encoding"
              render={({ field }) => (
                <Field className="col-span-2">
                  <FieldLabel htmlFor="value.encoding">Type</FieldLabel>
                  <NumberSelect onChange={field.onChange} options={filteredEncodingOptions} value={field.value} />
                </Field>
              )}
            />
            {Boolean(showValueSchemaSelection) && (
              <Controller
                control={control}
                name="value.schemaName"
                render={({ field }) => (
                  <Field className="col-span-2">
                    <FieldLabel htmlFor="value.schemaName">Schema</FieldLabel>
                    <Select
                      onValueChange={(newVal) => {
                        field.onChange(newVal);

                        if (newVal) {
                          // Fetch schema details to get available versions
                          api.refreshSchemaDetails(newVal).then(() => {
                            const detail = api.schemaDetails.get(newVal);
                            if (detail?.latestActiveVersion) {
                              setValue('value.schemaVersion', detail.latestActiveVersion);
                            }
                          });
                        }
                      }}
                      value={field.value}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {schemaNameOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            )}
            {Boolean(showValueSchemaSelection) && (
              <Controller
                control={control}
                name="value.schemaVersion"
                render={({ field }) => (
                  <Field className="col-span-1">
                    <FieldLabel htmlFor="value.schemaVersion">Version</FieldLabel>
                    <NumberSelect onChange={field.onChange} options={sortedValueVersions} value={field.value} />
                  </Field>
                )}
              />
            )}
          </div>

          {valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF && (
            <Field>
              <FieldLabel htmlFor="value.protobufIndex">Index</FieldLabel>
              {protoBufInfoElement}
              <Input
                id="value.protobufIndex"
                type="number"
                {...register('value.protobufIndex', { valueAsNumber: true })}
              />
            </Field>
          )}

          {valuePayloadOptions.encoding !== PayloadEncoding.NULL && (
            <Field data-invalid={!!errors.value?.data}>
              <FieldLabel>Data</FieldLabel>
              <div data-testid="produce-value-editor">
                <Controller
                  control={control}
                  name="value.data"
                  render={({ field: { onChange, value } }) => (
                    <KowlEditor
                      data-testid="produce-message-value"
                      height={300}
                      language={encodingToLanguage(valuePayloadOptions?.encoding)}
                      onChange={onChange}
                      onMount={setMonacoTheme}
                      value={value}
                    />
                  )}
                />
              </div>
              {Boolean(errors.value?.data) && <FieldError>{errors.value?.data?.message}</FieldError>}
              <input {...register('value.data')} data-testid="valueData" />
            </Field>
          )}
        </div>
      </FieldSet>

      {!!errors?.root?.serverError && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.serverError.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-4">
        <Button data-testid="produce-button" isLoading={isSubmitting} type="submit">
          Produce
        </Button>
        <Button
          nativeButton={false}
          render={
            <Link params={{ topicName: encodeURIComponent(topicName) }} search={{} as never} to="/topics/$topicName" />
          }
          variant="outline"
        >
          Go Back
        </Button>
      </div>
    </form>
  );
};

export const TopicProducePage: FC<{ topicName: string }> = ({ topicName }) => {
  useEffect(() => {
    setPageHeader('Produce Kafka record', [
      { title: 'Topics', linkTo: '/topics' },
      { title: substringWithEllipsis(topicName, 50), linkTo: `/topics/${topicName}` },
      { title: 'Produce record', linkTo: `/topics/${topicName}/produce-record` },
    ]);
  }, [topicName]);

  useEffect(() => {
    api.refreshSchemaSubjects();
    api.refreshTopics();
  }, []);

  useEffect(() => {
    appGlobal.onRefresh = () => {
      api.refreshSchemaSubjects(true);
      api.refreshTopics(true);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-lead text-muted-foreground">This will produce a single record to the topic.</p>
      <div className="mt-6">
        <PublishTopicForm topicName={topicName} />
      </div>
    </div>
  );
};
