import { create } from '@bufbuild/protobuf';
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
  Link,
  SectionHeading,
  Text,
  useToast,
} from '@redpanda-data/ui';
import { autorun, computed } from 'mobx';
import { observer } from 'mobx-react';
import { type FC, useEffect, useState } from 'react';
import { Controller, type SubmitHandler, useFieldArray, useForm } from 'react-hook-form';
import { HiOutlineTrash } from 'react-icons/hi';
import { Link as ReactRouterLink } from 'react-router-dom';

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
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
import { Label } from '../../../utils/tsxUtils';
import { base64ToUInt8Array, isValidBase64, substringWithEllipsis } from '../../../utils/utils';
import KowlEditor from '../../misc/KowlEditor';
import { SingleSelect } from '../../misc/Select';
import { PageComponent, type PageInitHelper } from '../Page';

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
  <Text>
    Protobuf schemas can define multiple types. Specify which type you want to use for this message.{' '}
    <Link href="https://protobuf.dev/reference/protobuf/google.protobuf/" rel="noopener noreferrer" target="_blank">
      Learn more here.
    </Link>
  </Text>
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

type PayloadOptions = {
  encoding: PayloadEncoding;
  data: string;

  // Schema name
  schemaName?: string;
  schemaVersion?: number;
  schemaId?: number;

  protobufIndex?: number; // if encoding is protobuf, we also need an index
};

type Inputs = {
  partition: number;
  compressionType: CompressionType;
  headers: { key: string; value: string }[];
  key: PayloadOptions;
  value: PayloadOptions;
};

const PublishTopicForm: FC<{ topicName: string }> = observer(({ topicName }) => {
  const toast = useToast();

  const {
    control,
    register,
    setValue,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
    watch,
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

  const keyPayloadOptions = watch('key');
  const valuePayloadOptions = watch('value');

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

  useEffect(() => {
    setValue('key.data', '');
  }, [setValue]);

  useEffect(() => {
    setValue('value.data', '');
  }, [setValue]);

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

  const availablePartitions = computed(() => {
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
  });

  useEffect(() => {
    return autorun(() => {
      const filteredSoftDeletedSchemaSubjects =
        api.schemaSubjects?.filter(
          (x) => uiSettings.schemaList.showSoftDeleted || !(uiSettings.schemaList.showSoftDeleted || x.isSoftDeleted)
        ) ?? [];

      const formattedSchemaSubjects = filteredSoftDeletedSchemaSubjects?.filter((x) =>
        x.name.toLowerCase().includes(uiSettings.schemaList.quickSearch.toLowerCase())
      );

      for (const schemaSubject of formattedSchemaSubjects) {
        api.refreshSchemaDetails(schemaSubject.name).catch(() => {
          // Error handling managed by API layer
        });
      }
    });
  }, []);

  const availableValues = Array.from(api.schemaDetails.values());

  const keySchemaName = watch('key.schemaName');
  const valueSchemaName = watch('value.schemaName');

  const onSubmit: SubmitHandler<Inputs> = async (data) => {
    const req = create(PublishMessageRequestSchema);
    req.topic = topicName;
    req.partitionId = data.partition;
    req.compression = data.compressionType;

    uiState.topicSettings.produceRecordCompression = data.compressionType;

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

    const encodeData = (data: string, encoding: PayloadEncoding): Uint8Array => {
      if (encoding === PayloadEncoding.BINARY) {
        // This will throw an exception if data is not base64.
        // We want to catch exceptions so that we can show an error.
        window.atob(data);
        return base64ToUInt8Array(data);
      }

      return new TextEncoder().encode(data);
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
      req.key.schemaId = data.key.schemaId;
      req.key.index = data.key.protobufIndex;
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
      req.value.schemaId = data.value.schemaId;
      req.value.index = data.value.protobufIndex;
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

  const filteredEncodingOptions = encodingOptions.filter((x) => x.value !== PayloadEncoding.AVRO);

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
                  <SingleSelect<number> onChange={onChange} options={availablePartitions.get()} value={value} />
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
                icon={<HiOutlineTrash />}
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
            </GridItem>
            <GridItem colSpan={2}>
              {showKeySchemaSelection && (
                <Label text="Schema">
                  <Controller
                    control={control}
                    name="key.schemaName"
                    render={({ field: { onChange, value } }) => (
                      <SingleSelect<string | undefined>
                        onChange={(newVal) => {
                          onChange(newVal);

                          const detail = availableValues.filter((value) => value.name === newVal).first();
                          setValue('key.schemaVersion', detail?.latestActiveVersion);
                        }}
                        options={availableValues.map((value) => ({
                          key: value.name,
                          value: value.name,
                        }))}
                        value={value}
                      />
                    )}
                  />
                </Label>
              )}
            </GridItem>
            <GridItem colSpan={1}>
              {showKeySchemaSelection && (
                <Label text="Version">
                  <Controller
                    control={control}
                    name="key.schemaVersion"
                    render={({ field: { onChange, value } }) => (
                      <SingleSelect<number | undefined>
                        onChange={onChange}
                        options={availableValues
                          .filter((value) => value.name === keySchemaName)
                          .flatMap((value) => value.versions)
                          .sort(({ version: version1 }, { version: version2 }) => version2 - version1)
                          .map(({ version }) => ({
                            label: version,
                            value: version,
                          }))}
                        value={value}
                      />
                    )}
                  />
                </Label>
              )}
            </GridItem>
          </Grid>

          {keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF && (
            <Label text="Index">
              {protoBufInfoElement}
              <Input my={2} type="number" {...register('key.protobufIndex')} />
            </Label>
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
              </Box>
            </Label>
          )}
          {errors?.key?.data && <Text color="red.500">{errors.key.data.message}</Text>}
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
              </GridItem>
              <GridItem colSpan={2}>
                {showValueSchemaSelection && (
                  <Label text="Schema">
                    <Controller
                      control={control}
                      name="value.schemaName"
                      render={({ field: { onChange, value } }) => (
                        <SingleSelect<string | undefined>
                          onChange={(newVal) => {
                            onChange(newVal);

                            const detail = availableValues.filter((value) => value.name === newVal).first();
                            setValue('value.schemaVersion', detail?.latestActiveVersion);
                          }}
                          options={availableValues.map((value) => ({
                            key: value.name,
                            value: value.name,
                          }))}
                          value={value}
                        />
                      )}
                    />
                  </Label>
                )}
              </GridItem>
              <GridItem colSpan={1}>
                {showValueSchemaSelection && (
                  <Label text="Version">
                    <Controller
                      control={control}
                      name="value.schemaVersion"
                      render={({ field: { onChange, value } }) => (
                        <SingleSelect<number | undefined>
                          onChange={onChange}
                          options={availableValues
                            .filter((value) => value.name === valueSchemaName)
                            .flatMap((value) => value.versions)
                            .sort(({ version: version1 }, { version: version2 }) => version2 - version1)
                            .map(({ version }) => ({
                              label: version,
                              value: version,
                            }))}
                          value={value}
                        />
                      )}
                    />
                  </Label>
                )}
              </GridItem>
            </Grid>

            {valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF && (
              <Label text="Index">
                {protoBufInfoElement}
                <Input my={2} type="number" {...register('value.protobufIndex')} />
              </Label>
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
                </Box>
              </Label>
            )}
            {errors?.value?.data && <Text color="red.500">{errors.value.data.message}</Text>}
            <input {...register('value.data')} data-testid="valueData" />
          </Flex>
        </Flex>

        {!!errors?.root?.serverError && <Alert status="error">{errors.root.serverError.message}</Alert>}

        <Flex alignItems="center" gap={4}>
          <Button colorScheme="brand" data-testid="produce-button" isLoading={isSubmitting} type="submit">
            Produce
          </Button>
          <Link as={ReactRouterLink} to={`/topics/${encodeURIComponent(topicName)}`}>
            Go Back
          </Link>
        </Flex>
      </Grid>
    </form>
  );
});

@observer
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
