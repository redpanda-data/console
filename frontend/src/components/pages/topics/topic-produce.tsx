import { create } from '@bufbuild/protobuf';
import { config as appConfig } from '../../../config';
import {
  GenerateSchemaSampleRequestSchema,
  ListSchemaMessageTypesRequestSchema,
  type ProtoMessageType,
} from '../../../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import {
  Alert,
  Box,
  Button,
  Divider,
  Flex,
  FormControl,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Input,
  SectionHeading,
  Text,
  useToast,
} from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { TrashIcon } from 'components/icons';
import { type FC, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, type SubmitHandler, useFieldArray, useForm, useWatch } from 'react-hook-form';

import { setMonacoTheme } from '../../../config';
import {
  CompressionType,
  CompressionTypeSchema,
  KafkaRecordHeaderSchema,
  PayloadEncoding,
} from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { SchemaType, type SchemaTypeType } from '../../../state/rest-interfaces';

// Maps Schema Registry's schema type (AVRO/PROTOBUF/JSON) onto the payload
// encoding the Console PublishMessage RPC expects. JSON-Schema rather than
// plain JSON so the schema-registry-backed serde path is used.
const schemaTypeToEncoding = (t: SchemaTypeType): PayloadEncoding | undefined => {
  if (t === SchemaType.PROTOBUF) {
    return PayloadEncoding.PROTOBUF;
  }
  if (t === SchemaType.AVRO) {
    return PayloadEncoding.AVRO;
  }
  if (t === SchemaType.JSON) {
    return PayloadEncoding.JSON_SCHEMA;
  }
  return undefined;
};
import {
  PublishMessagePayloadOptionsSchema,
  PublishMessageRequestSchema,
} from '../../../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import { uiState } from '../../../state/ui-state';
import { Label } from '../../../utils/tsx-utils';
import { base64ToUInt8Array, isValidBase64, substringWithEllipsis } from '../../../utils/utils';
import KowlEditor from '../../misc/kowl-editor';
import { SingleSelect } from '../../misc/select';
import { PageComponent, type PageInitHelper } from '../page';

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
  {
    value: PayloadEncoding.PROTOBUF,
    label: 'Protobuf',
    tooltip: 'The given JSON will be serialized using the selected schema',
  },
  {
    value: PayloadEncoding.JSON_SCHEMA,
    label: 'JSON Schema',
    tooltip: 'The given JSON will be validated against the selected JSON Schema and tagged with its schema ID',
  },
  {
    value: PayloadEncoding.BINARY,
    label: 'Binary (Base64)',
    tooltip: 'Message value is binary, represented as a base64 string in the editor',
  },
];

const protoBufInfoElement = (
  <Text>
    Protobuf schemas can define multiple types. Specify which type you want to use for this message.{' '}
    <a href="https://protobuf.dev/reference/protobuf/google.protobuf/" rel="noopener noreferrer" target="_blank">
      Learn more here.
    </a>
  </Text>
);

function encodingToLanguage(encoding: PayloadEncoding) {
  if (encoding === PayloadEncoding.AVRO) {
    return 'json';
  }
  if (encoding === PayloadEncoding.JSON) {
    return 'json';
  }
  if (encoding === PayloadEncoding.JSON_SCHEMA) {
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

type PayloadOptions = {
  encoding: PayloadEncoding;
  data: string;

  // Schema name
  schemaName?: string;
  schemaVersion?: number;
  schemaId?: number;

  // Confluent Protobuf message-index path. Empty = first top-level message.
  protobufIndexPath?: number[];
};

const indexPathKey = (path: number[] | undefined): string => JSON.stringify(path ?? []);

type Inputs = {
  partition: number;
  compressionType: CompressionType;
  headers: { key: string; value: string }[];
  key: PayloadOptions;
  value: PayloadOptions;
};

const persistCompressionType = (compressionType: CompressionType) => {
  uiState.topicSettings.produceRecordCompression = compressionType;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
const PublishTopicForm: FC<{ topicName: string }> = ({ topicName }) => {
  const toast = useToast();

  const {
    control,
    register,
    setValue,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
    clearErrors,
  } = useForm<Inputs>({
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

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'headers',
  });

  const keyPayloadOptions = useWatch({ control, name: 'key' });
  const valuePayloadOptions = useWatch({ control, name: 'value' });

  const [isKeyExpanded, setKeyExpanded] = useState(false);
  useEffect(() => {
    if (keyPayloadOptions.encoding === PayloadEncoding.BINARY && !isValidBase64(keyPayloadOptions.data)) {
      setError('key.data', {
        type: 'manual',
        message: 'Invalid Base64 format',
      });
    } else {
      clearErrors('key.data');
    }
  }, [keyPayloadOptions.encoding, keyPayloadOptions.data, setError, clearErrors]);

  useEffect(() => {
    if (valuePayloadOptions.encoding === PayloadEncoding.BINARY && !isValidBase64(valuePayloadOptions.data)) {
      setError('value.data', {
        type: 'manual',
        message: 'Invalid Base64 format',
      });
    } else {
      clearErrors('value.data');
    }
  }, [valuePayloadOptions.encoding, valuePayloadOptions.data, setError, clearErrors]);

  const encodingNeedsSchema = (enc?: PayloadEncoding | 'base64') =>
    enc === PayloadEncoding.AVRO || enc === PayloadEncoding.PROTOBUF || enc === PayloadEncoding.JSON_SCHEMA;
  const showKeySchemaSelection = encodingNeedsSchema(keyPayloadOptions.encoding);
  const showValueSchemaSelection = encodingNeedsSchema(valuePayloadOptions.encoding);

  const compressionTypes = CompressionTypeSchema.values
    .filter((value) => value.number !== CompressionType.UNSPECIFIED)
    .map((value) => ({
      label: value.localName,
      value: value.number as CompressionType,
    }));

  const availablePartitions = (() => {
    const partitions: { label: string; value: number }[] = [{ label: 'Auto (Murmur2)', value: -1 }];

    const count = api.topics?.first((t) => t.topicName === topicName)?.partitionCount;
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

  useEffect(() => {
    // Fetch schema subjects list if not already loaded
    if (!api.schemaSubjects) {
      api.refreshSchemaSubjects();
    }
    if (!api.schemas) {
      api.refreshSchemas(undefined, { latestOnly: true });
    }
  }, []);

  // UX-1292: auto-detect Avro/Protobuf/JSON-Schema on first mount by checking
  // for the conventional `${topic}-key` / `${topic}-value` subjects (Kafka
  // TopicNameStrategy). One-shot — once we've pre-filled (or determined there
  // is nothing to pre-fill), this never runs again so we don't clobber edits.
  const autoDetectedRef = useRef(false);
  const [autoDetected, setAutoDetected] = useState<{ key?: string; value?: string }>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot on first subjects load
  useEffect(() => {
    if (autoDetectedRef.current || !api.schemaSubjects) {
      return;
    }
    autoDetectedRef.current = true;

    const tryAutoFill = async (target: 'key' | 'value') => {
      const subjectName = `${topicName}-${target}`;
      const subj = api.schemaSubjects?.find((s) => s.name === subjectName && !s.isSoftDeleted);
      if (!subj) {
        return;
      }
      try {
        await api.refreshSchemaDetails(subjectName);
      } catch {
        return;
      }
      const detail = api.schemaDetails.get(subjectName);
      if (!detail) {
        return;
      }
      const encoding = schemaTypeToEncoding(detail.type);
      if (encoding === undefined) {
        return;
      }
      setValue(`${target}.encoding`, encoding);
      setValue(`${target}.schemaName`, subjectName);
      if (detail.latestActiveVersion) {
        setValue(`${target}.schemaVersion`, detail.latestActiveVersion);
      }
      setAutoDetected((prev) => ({ ...prev, [target]: subjectName }));
    };

    tryAutoFill('key');
    tryAutoFill('value');
  }, [api.schemaSubjects, topicName]);

  // Subscribe reactively so the Schema dropdown updates once subjects finish
  // loading. Direct `api.schemaSubjects` access doesn't track in a render and
  // would otherwise stay empty when nothing else triggers a re-render.
  const schemaSubjectsReactive = useApiStoreHook((s) => s.schemaSubjects);
  const schemasReactive = useApiStoreHook((s) => s.schemas);
  const availableValues = schemaSubjectsReactive?.filter((x) => !x.isSoftDeleted) ?? [];
  const subjectTypeMap = useMemo(() => {
    const m = new Map<string, SchemaTypeType>();
    for (const entry of schemasReactive ?? []) {
      m.set(entry.subject, entry.type);
    }
    return m;
  }, [schemasReactive]);

  const keySchemaName = useWatch({ control, name: 'key.schemaName' });
  const valueSchemaName = useWatch({ control, name: 'value.schemaName' });
  const keySchemaVersion = useWatch({ control, name: 'key.schemaVersion' });
  const valueSchemaVersion = useWatch({ control, name: 'value.schemaVersion' });
  const keyEncoding = useWatch({ control, name: 'key.encoding' });
  const valueEncoding = useWatch({ control, name: 'value.encoding' });

  // UX-1292 follow-up: filter the Schema dropdown to subjects that match the
  // selected encoding. Subject→type comes from the dedicated subject-types
  // endpoint (one round trip via Schema Registry's GET /schemas?latestOnly).
  const encodingToSchemaType = (enc?: PayloadEncoding | 'base64'): SchemaTypeType | undefined => {
    if (enc === PayloadEncoding.AVRO) {
      return SchemaType.AVRO;
    }
    if (enc === PayloadEncoding.PROTOBUF) {
      return SchemaType.PROTOBUF;
    }
    if (enc === PayloadEncoding.JSON_SCHEMA) {
      return SchemaType.JSON;
    }
    return undefined;
  };

  const filterSubjectsByEncoding = (enc?: PayloadEncoding | 'base64') => {
    const wanted = encodingToSchemaType(enc);
    if (!wanted) {
      return availableValues;
    }
    // If the subject isn't in the type map (e.g. types haven't loaded yet, or
    // the backend couldn't determine it), keep it visible rather than silently
    // dropping it.
    return availableValues.filter((subj) => {
      const t = subjectTypeMap.get(subj.name);
      return t === undefined || t === wanted;
    });
  };

  const keyAvailableValues = filterSubjectsByEncoding(keyEncoding);
  const valueAvailableValues = filterSubjectsByEncoding(valueEncoding);

  const resolveSchemaId = (subjectName?: string, version?: number): number | undefined => {
    if (!(subjectName && version)) {
      return undefined;
    }
    const detail = api.schemaDetails.get(subjectName);
    if (!detail) {
      return undefined;
    }
    const match = detail.schemas.find((s) => s.version === version && !s.isSoftDeleted);
    return match?.id;
  };

  const keySchemaId = encodingNeedsSchema(keyEncoding) ? resolveSchemaId(keySchemaName, keySchemaVersion) : undefined;
  const valueSchemaId = encodingNeedsSchema(valueEncoding)
    ? resolveSchemaId(valueSchemaName, valueSchemaVersion)
    : undefined;

  const [keyMessageTypes, setKeyMessageTypes] = useState<ProtoMessageType[]>([]);
  const [valueMessageTypes, setValueMessageTypes] = useState<ProtoMessageType[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch only when schemaId changes
  useEffect(() => {
    if (!keySchemaId) {
      setKeyMessageTypes([]);
      return;
    }
    const client = appConfig.consoleClient;
    if (!client) {
      return;
    }
    const req = create(ListSchemaMessageTypesRequestSchema);
    req.schemaId = keySchemaId;
    let cancelled = false;
    client
      .listSchemaMessageTypes(req)
      .then((res) => {
        if (cancelled) {
          return;
        }
        setKeyMessageTypes(res.messageTypes);
        const current = keyPayloadOptions.protobufIndexPath ?? [];
        const stillValid = res.messageTypes.some((t) => indexPathKey(t.indexPath) === indexPathKey(current));
        if (!stillValid && res.messageTypes.length > 0) {
          setValue('key.protobufIndexPath', res.messageTypes[0].indexPath);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKeyMessageTypes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [keySchemaId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-fetch only when schemaId changes
  useEffect(() => {
    if (!valueSchemaId) {
      setValueMessageTypes([]);
      return;
    }
    const client = appConfig.consoleClient;
    if (!client) {
      return;
    }
    const req = create(ListSchemaMessageTypesRequestSchema);
    req.schemaId = valueSchemaId;
    let cancelled = false;
    client
      .listSchemaMessageTypes(req)
      .then((res) => {
        if (cancelled) {
          return;
        }
        setValueMessageTypes(res.messageTypes);
        const current = valuePayloadOptions.protobufIndexPath ?? [];
        const stillValid = res.messageTypes.some((t) => indexPathKey(t.indexPath) === indexPathKey(current));
        if (!stillValid && res.messageTypes.length > 0) {
          setValue('value.protobufIndexPath', res.messageTypes[0].indexPath);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValueMessageTypes([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [valueSchemaId]);

  const generateSample = async (target: 'key' | 'value', schemaId: number | undefined, indexPath: number[] | undefined) => {
    if (!schemaId) {
      return;
    }
    const client = appConfig.consoleClient;
    if (!client) {
      return;
    }
    // Single RPC for all three schema types — backend dispatches on schema kind.
    // indexPath is only consulted for Protobuf and may be empty otherwise.
    const req = create(GenerateSchemaSampleRequestSchema);
    req.schemaId = schemaId;
    req.indexPath = indexPath ?? [];
    const res = await client.generateSchemaSample(req).catch(() => undefined);
    if (res?.sampleJson) {
      setValue(`${target}.data`, res.sampleJson, { shouldDirty: true });
    }
  };

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

      // Determine schemaId from schemaVersion if schema is selected and encoding is Avro, Protobuf, or JSON Schema
      if (
        encodingNeedsSchema(data.key.encoding) &&
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

      if (data.key.encoding === PayloadEncoding.PROTOBUF && data.key.protobufIndexPath) {
        req.key.indexPath = data.key.protobufIndexPath;
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

      // Determine schemaId from schemaVersion if schema is selected and encoding is Avro, Protobuf, or JSON Schema
      if (
        encodingNeedsSchema(data.value.encoding) &&
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

      if (data.value.encoding === PayloadEncoding.PROTOBUF && data.value.protobufIndexPath) {
        req.value.indexPath = data.value.protobufIndexPath;
      }
    }

    const result = await api.publishMessage(req).catch((err) => {
      setError('root.serverError', {
        message: err.rawMessage,
      });
    });

    if (result) {
      toast({
        status: 'success',
        description: (
          <>
            Record published on partition <span className="codeBox">{result.partitionId}</span> with offset{' '}
            <span className="codeBox">{Number(result.offset)}</span>
          </>
        ),
        duration: 3000,
      });
      appGlobal.historyPush(`/topics/${encodeURIComponent(topicName)}`);
    }
  };

  const filteredEncodingOptions = encodingOptions;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Grid flexDirection="column" gap={6} width={['100%', '100%', 600]}>
        <Flex flexDirection="row" gap={4}>
          <Box flexGrow={1}>
            <Label text="Partition">
              <Controller
                control={control}
                name="partition"
                render={({ field: { onChange, value } }) => (
                  <SingleSelect<number> onChange={onChange} options={availablePartitions} value={value} />
                )}
              />
            </Label>
          </Box>
          <Box flexGrow={1}>
            <Label text="Compression Type">
              <Controller
                control={control}
                name="compressionType"
                render={({ field: { onChange, value } }) => (
                  <SingleSelect<CompressionType> onChange={onChange} options={compressionTypes} value={value} />
                )}
              />
            </Label>
          </Box>
        </Flex>

        <Divider />

        <Flex flexDirection="column" gap={4}>
          <SectionHeading>Headers</SectionHeading>

          {fields.map((field, index) => (
            <HStack key={field.id} spacing={2}>
              <FormControl>
                <Input {...register(`headers.${index}.key`)} placeholder="Key" />
              </FormControl>
              <FormControl>
                <Input {...register(`headers.${index}.value`)} placeholder="Value" />
              </FormControl>
              <IconButton
                aria-label="Remove item"
                icon={<TrashIcon />}
                onClick={() => remove(index)}
                variant="outline"
              />
            </HStack>
          ))}

          <Box>
            <Button onClick={() => append({ key: '', value: '' })} size="sm" type="button" variant="outline">
              Add row
            </Button>
          </Box>
        </Flex>

        <Divider />

        <Flex flexDirection="column" gap={4}>
          <SectionHeading>Key</SectionHeading>
          <Grid gap={2} templateColumns="repeat(5, 1fr)">
            <GridItem colSpan={2}>
              <Label text="Type">
                <Controller
                  control={control}
                  name="key.encoding"
                  render={({ field: { onChange, value } }) => (
                    <SingleSelect<PayloadEncoding | 'base64'>
                      onChange={onChange}
                      options={filteredEncodingOptions}
                      value={value}
                    />
                  )}
                />
              </Label>
              {autoDetected.key && (
                <Text color="gray.600" fontSize="xs" mt={1}>
                  Auto-detected from <span className="codeBox">{autoDetected.key}</span>
                </Text>
              )}
            </GridItem>
            <GridItem colSpan={2}>
              {Boolean(showKeySchemaSelection) && (
                <Label text="Schema">
                  <Controller
                    control={control}
                    name="key.schemaName"
                    render={({ field: { onChange, value } }) => (
                      <SingleSelect<string | undefined>
                        onChange={(newVal) => {
                          onChange(newVal);

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
                        options={keyAvailableValues.map((schema) => ({
                          key: schema.name,
                          value: schema.name,
                        }))}
                        value={value}
                      />
                    )}
                  />
                </Label>
              )}
            </GridItem>
            <GridItem colSpan={1}>
              {Boolean(showKeySchemaSelection) && (
                <Label text="Version">
                  <Controller
                    control={control}
                    name="key.schemaVersion"
                    render={({ field: { onChange, value } }) => {
                      const schemaDetail = keySchemaDetail;
                      return (
                        <SingleSelect<number | undefined>
                          onChange={onChange}
                          options={
                            schemaDetail?.versions
                              .slice()
                              .sort(({ version: version1 }, { version: version2 }) => version2 - version1)
                              .map(({ version }) => ({
                                label: version,
                                value: version,
                              })) ?? []
                          }
                          value={value}
                        />
                      );
                    }}
                  />
                </Label>
              )}
            </GridItem>
          </Grid>

          {keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF && (
            <>
              {protoBufInfoElement}
              <Label text="Message type">
                <Controller
                  control={control}
                  name="key.protobufIndexPath"
                  render={({ field: { onChange, value } }) => (
                    <SingleSelect<string | undefined>
                      isDisabled={keyMessageTypes.length === 0}
                      onChange={(newKey) => {
                        const match = keyMessageTypes.find((t) => indexPathKey(t.indexPath) === newKey);
                        onChange(match ? match.indexPath : []);
                      }}
                      options={keyMessageTypes.map((t) => ({
                        label: t.fullyQualifiedName,
                        value: indexPathKey(t.indexPath),
                      }))}
                      value={value && value.length > 0 ? indexPathKey(value) : undefined}
                    />
                  )}
                />
              </Label>
            </>
          )}

          {keyPayloadOptions.encoding !== PayloadEncoding.NULL && (
            <Label text="Data">
              <Box data-testid="produce-key-editor">
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
                <Button mt={1} onClick={() => setKeyExpanded(!isKeyExpanded)} px={0} size="sm" variant="link">
                  {isKeyExpanded ? 'Collapse' : 'Expand'}
                </Button>
                {encodingNeedsSchema(keyPayloadOptions.encoding) && (
                  <Button
                    isDisabled={
                      !keySchemaId ||
                      (keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF && keyMessageTypes.length === 0)
                    }
                    ml={2}
                    mt={1}
                    onClick={() => generateSample('key', keySchemaId, keyPayloadOptions.protobufIndexPath)}
                    size="sm"
                    variant="outline"
                  >
                    Generate sample JSON
                  </Button>
                )}
              </Box>
            </Label>
          )}
          {Boolean(errors?.key?.data) && <Text color="red.500">{errors?.key?.data?.message}</Text>}
        </Flex>

        <Divider />

        <Flex flexDirection="column" gap={4}>
          <SectionHeading>Value</SectionHeading>
          <Flex flexDirection="column" gap={2}>
            <Grid gap={2} templateColumns="repeat(5, 1fr)">
              <GridItem colSpan={2}>
                <Label text="Type">
                  <Controller
                    control={control}
                    name="value.encoding"
                    render={({ field: { onChange, value } }) => (
                      <SingleSelect<PayloadEncoding | 'base64'>
                        onChange={onChange}
                        options={filteredEncodingOptions}
                        value={value}
                      />
                    )}
                  />
                </Label>
                {autoDetected.value && (
                  <Text color="gray.600" fontSize="xs" mt={1}>
                    Auto-detected from <span className="codeBox">{autoDetected.value}</span>
                  </Text>
                )}
              </GridItem>
              <GridItem colSpan={2}>
                {Boolean(showValueSchemaSelection) && (
                  <Label text="Schema">
                    <Controller
                      control={control}
                      name="value.schemaName"
                      render={({ field: { onChange, value } }) => (
                        <SingleSelect<string | undefined>
                          onChange={(newVal) => {
                            onChange(newVal);

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
                          options={valueAvailableValues.map((schema) => ({
                            key: schema.name,
                            value: schema.name,
                          }))}
                          value={value}
                        />
                      )}
                    />
                  </Label>
                )}
              </GridItem>
              <GridItem colSpan={1}>
                {Boolean(showValueSchemaSelection) && (
                  <Label text="Version">
                    <Controller
                      control={control}
                      name="value.schemaVersion"
                      render={({ field: { onChange, value } }) => {
                        const schemaDetail = valueSchemaDetail;
                        return (
                          <SingleSelect<number | undefined>
                            onChange={onChange}
                            options={
                              schemaDetail?.versions
                                .slice()
                                .sort(({ version: version1 }, { version: version2 }) => version2 - version1)
                                .map(({ version }) => ({
                                  label: version,
                                  value: version,
                                })) ?? []
                            }
                            value={value}
                          />
                        );
                      }}
                    />
                  </Label>
                )}
              </GridItem>
            </Grid>

            {valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF && (
              <>
                {protoBufInfoElement}
                <Label text="Message type">
                  <Controller
                    control={control}
                    name="value.protobufIndexPath"
                    render={({ field: { onChange, value } }) => (
                      <SingleSelect<string | undefined>
                        isDisabled={valueMessageTypes.length === 0}
                        onChange={(newKey) => {
                          const match = valueMessageTypes.find((t) => indexPathKey(t.indexPath) === newKey);
                          onChange(match ? match.indexPath : []);
                        }}
                        options={valueMessageTypes.map((t) => ({
                          label: t.fullyQualifiedName,
                          value: indexPathKey(t.indexPath),
                        }))}
                        value={value && value.length > 0 ? indexPathKey(value) : undefined}
                      />
                    )}
                  />
                </Label>
              </>
            )}

            {valuePayloadOptions.encoding !== PayloadEncoding.NULL && (
              <Label text="Data">
                <Box data-testid="produce-value-editor">
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
                  {encodingNeedsSchema(valuePayloadOptions.encoding) && (
                    <Button
                      isDisabled={
                        !valueSchemaId ||
                        (valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF && valueMessageTypes.length === 0)
                      }
                      mt={1}
                      onClick={() => generateSample('value', valueSchemaId, valuePayloadOptions.protobufIndexPath)}
                      size="sm"
                      variant="outline"
                    >
                      Generate sample JSON
                    </Button>
                  )}
                </Box>
              </Label>
            )}
            {Boolean(errors?.value?.data) && <Text color="red.500">{errors?.value?.data?.message}</Text>}
          </Flex>
        </Flex>

        {!!errors?.root?.serverError && <Alert status="error">{errors.root.serverError.message}</Alert>}

        <Flex alignItems="center" gap={4}>
          <Button data-testid="produce-button" isLoading={isSubmitting} type="submit">
            Produce
          </Button>
          <Link params={{ topicName: encodeURIComponent(topicName) }} search={{} as never} to="/topics/$topicName">
            Go Back
          </Link>
        </Flex>
      </Grid>
    </form>
  );
};

export class TopicProducePage extends PageComponent<{ topicName: string }> {
  initPage(p: PageInitHelper): void {
    const topicName = this.props.topicName;
    p.title = 'Produce';
    p.addBreadcrumb('Topics', '/topics');
    p.addBreadcrumb(substringWithEllipsis(topicName, 50), `/topics/${topicName}`);

    p.addBreadcrumb('Produce record', '/produce-record');
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaSubjects(force);
  }

  render() {
    return (
      <Box>
        <Heading as="h1" noOfLines={1} py={2}>
          Produce Kafka record
        </Heading>
        <Text fontSize="lg">This will produce a single record to the topic.</Text>

        <Box my={6}>
          <PublishTopicForm topicName={this.props.topicName} />
        </Box>
      </Box>
    );
  }
}
