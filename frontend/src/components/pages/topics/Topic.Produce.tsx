import { Alert, Box, Button, Divider, Flex, FormControl, Grid, GridItem, Heading, HStack, IconButton, Input, Link, SectionHeading, Text, useToast } from '@redpanda-data/ui';
import { PageComponent, PageInitHelper } from '../Page';
import { autorun, computed } from 'mobx';
import { api } from '../../../state/backendApi';
import { observer } from 'mobx-react';
import { Controller, SubmitHandler, useFieldArray, useForm } from 'react-hook-form'
import { FC, useEffect } from 'react';
import { SingleSelect } from '../../misc/Select';
import { Label } from '../../../utils/tsxUtils';
import { proto3 } from '@bufbuild/protobuf';
import { CompressionType, KafkaRecordHeader, PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { HiOutlineTrash } from 'react-icons/hi';
import KowlEditor, { IStandaloneCodeEditor, Monaco } from '../../misc/KowlEditor';
import { Link as ReactRouterLink } from 'react-router-dom'
import { PublishMessagePayloadOptions, PublishMessageRequest } from '../../../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';
import { uiSettings } from '../../../state/ui';
import { appGlobal } from '../../../state/appGlobal';
import { base64ToUInt8Array } from '../../../utils/utils';

type EncodingOption = {
    value: PayloadEncoding | 'base64',
    label: string,
    tooltip: string, // React.ReactNode | (() => React.ReactNode),
};
const encodingOptions: EncodingOption[] = [
    {value: PayloadEncoding.NULL, label: 'Null', tooltip: 'Message value will be null'},
    {value: PayloadEncoding.TEXT, label: 'Text', tooltip: 'Text in the editor will be encoded to UTF-8 bytes'},
    {value: PayloadEncoding.JSON, label: 'JSON', tooltip: 'Syntax higlighting for JSON, otherwise the same as text'},

    {value: PayloadEncoding.AVRO, label: 'Avro', tooltip: 'The given JSON will be serialized using the selected schema'},
    // We hide Protobuf until we can provide a better UX with selecting types rather than having users
    // specify an index that points to the type within the proto schema.
    // {value: PayloadEncoding.PROTOBUF, label: 'Protobuf', tooltip: 'The given JSON will be serialized using the selected schema'},

    {value: PayloadEncoding.BINARY, label: 'Binary (Base64)', tooltip: 'Message value is binary, represented as a base64 string in the editor'},
];

const protoBufInfoElement = <Text>
    Protobuf schemas can define multiple types. Specify which type you want to use for this
    message. <Link target="_blank" rel="noopener noreferrer" href="https://protobuf.dev/reference/protobuf/google.protobuf/">Learn more here.</Link>
</Text>

function encodingToLanguage(encoding: PayloadEncoding) {
    if (encoding == PayloadEncoding.AVRO) return 'json';
    if (encoding == PayloadEncoding.JSON) return 'json';
    if (encoding == PayloadEncoding.PROTOBUF) return 'protobuf';
    if (encoding == PayloadEncoding.BINARY) return 'plaintext';
    return undefined;
}

type PayloadOptions = {
    encoding: PayloadEncoding;
    data: string;

    // Schema name
    schemaName?: string;
    schemaVersion?: number;
    schemaId?: number;

    protobufIndex?: number; // if encoding is protobuf, we also need an index
}

type Inputs = {
    partition: number;
    compressionType: CompressionType;
    headers: { key: string; value: string }[];
    key: PayloadOptions;
    value: PayloadOptions;
}

const PublishTopicForm: FC<{ topicName: string }> = observer(({topicName}) => {
    const toast = useToast()

    const {
        control,
        register,
        setValue,
        handleSubmit,
        setError,
        formState: {
            isSubmitting,
            errors
        },
        watch
    } = useForm<Inputs>({
        defaultValues: {
            partition: -1,
            compressionType: CompressionType.SNAPPY,
            headers: [],
            key: {
                data: '',
                encoding: PayloadEncoding.TEXT,
            },
            value: {
                data: '',
                encoding: PayloadEncoding.TEXT,
            },
        }
    })

    const {fields, append, remove} = useFieldArray({
        control,
        name: 'headers',
    });


    const keyPayloadOptions = watch('key')
    const valuePayloadOptions = watch('value')

    const showKeySchemaSelection = keyPayloadOptions.encoding === PayloadEncoding.AVRO || keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF
    const showValueSchemaSelection = valuePayloadOptions.encoding === PayloadEncoding.AVRO || valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF

    const compressionTypes = proto3.getEnumType(CompressionType).values
        .filter(x => x.no != CompressionType.UNSPECIFIED)
        .map(x => ({label: x.localName, value: x.no as CompressionType}))

    const availablePartitions = computed(() => {
        const partitions: { label: string, value: number; }[] = [
            {label: 'Auto (CRC32)', value: -1},
        ];

        const count = api.topics?.first(t => t.topicName == topicName)?.partitionCount;
        if (count == undefined) {
            // topic not found
            return partitions;
        }

        if (count == 1) {
            // only one partition to select
            return partitions;
        }

        for (let i = 0; i < count; i++) {
            partitions.push({label: `Partition ${i}`, value: i});
        }

        return partitions;
    })

    useEffect(() => {
        return autorun(() => {
            api.schemaSubjects
                ?.filter(x => uiSettings.schemaList.showSoftDeleted || (!uiSettings.schemaList.showSoftDeleted && !x.isSoftDeleted))
                ?.filter(x => x.name.toLowerCase().includes(uiSettings.schemaList.quickSearch.toLowerCase()))
                .forEach(x => {
                    void api.refreshSchemaDetails(x.name);
                })
        })
    }, []);

    const availableValues = Array.from(api.schemaDetails.values())

    const keySchemaName = watch('key.schemaName')
    const valueSchemaName = watch('value.schemaName')

    const onSubmit: SubmitHandler<Inputs> = async (data) => {
        const req = new PublishMessageRequest();
        req.topic = topicName
        req.partitionId = data.partition
        req.compression = data.compressionType

        // Headers
        for (const h of data.headers) {
            if (!h.value && !h.value) {
                continue;
            }
            const kafkaHeader = new KafkaRecordHeader();
            kafkaHeader.key = h.key;
            kafkaHeader.value = new TextEncoder().encode(h.value);
            req.headers.push(kafkaHeader);
        }

        const encodeData = function(data: string, encoding: PayloadEncoding): Uint8Array {
            if (encoding == PayloadEncoding.BINARY) {
                // This will throw an exception if data is not base64.
                // We want to catch exceptions so that we can show an error.
                window.atob(data)
                return base64ToUInt8Array(data)
            }

            return new TextEncoder().encode(data)
        }

        // Key
        if (data.key.encoding != PayloadEncoding.NULL) {
            req.key = new PublishMessagePayloadOptions();
            try {
                req.key.data = encodeData(data.key.data, data.key.encoding);
            } catch (err) {
                // TODO: Handle error
                console.error(err)
                return
            }
            req.key.data = encodeData(data.key.data, data.key.encoding);
            req.key.encoding = data.key.encoding;
            req.key.schemaId = data.key.schemaId;
            req.key.index = data.key.protobufIndex;
        }

        // Value
        if (data.value.encoding != PayloadEncoding.NULL) {
            req.value = new PublishMessagePayloadOptions();
            try {
                req.value.data = encodeData(data.value.data, data.value.encoding);
            } catch (err) {
                // TODO: Handle error
                console.error(err)
                return
            }
            req.value.encoding = data.value.encoding;
            req.value.schemaId = data.value.schemaId;
            req.value.index = data.value.protobufIndex;
        }

        const result = await api.publishMessage(req).catch(err => {
            setError('root.serverError', {
                message: err.rawMessage,
            })
        })

        if (result) {
            toast({
                status: 'success',
                description: <>Record published on partition <span className="codeBox">{result.partitionId}</span> with offset <span className="codeBox">{Number(result.offset)}</span></>,
                duration: 3000
            })
            appGlobal.history.push(`/topics/${encodeURIComponent(topicName)}`)
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Grid width={['100%', '100%', 600]} gap={6} flexDirection="column">
                <Flex gap={4} flexDirection="row">
                    <Box flexGrow={1}>
                        <Label text="Partition">
                            <Controller
                                control={control}
                                name="partition"
                                render={({
                                             field: {onChange, value,},
                                         }) => (
                                    <SingleSelect<number>
                                        options={availablePartitions.get()}
                                        value={value}
                                        onChange={onChange}
                                    />
                                )}
                            />
                        </Label>
                    </Box>
                    <Box flexGrow={1}>
                        <Label text="Compression Type">
                            <Controller
                                control={control}
                                name="compressionType"
                                render={({
                                             field: {onChange, value,},
                                         }) => (
                                    <SingleSelect<CompressionType>
                                        options={compressionTypes}
                                        value={value}
                                        onChange={onChange}
                                    />
                                )}
                            />
                        </Label>
                    </Box>
                </Flex>

                <Divider />

                <Flex gap={4} flexDirection="column">
                    <SectionHeading>Headers</SectionHeading>
                    
                    {fields.map((field, index) => (
                        <HStack key={field.id} spacing={2}>
                            <FormControl>
                                <Input {...register(`headers.${index}.key`)} placeholder="Key"/>
                            </FormControl>
                            <FormControl>
                                <Input {...register(`headers.${index}.value`)} placeholder="Value"/>
                            </FormControl>
                            <IconButton
                                icon={<HiOutlineTrash/>}
                                aria-label="Remove item"
                                variant="outline"
                                onClick={() => remove(index)}
                            />
                        </HStack>))}

                    <Box>
                        <Button type="button" variant="outline" onClick={() => append({key: '', value: ''})} size="sm">
                            Add row
                        </Button>
                    </Box>
                </Flex>

                <Divider />

                <Flex gap={4} flexDirection="column">
                    <SectionHeading>Key</SectionHeading>
                    <Grid templateColumns="repeat(5, 1fr)" gap={2}>
                        <GridItem colSpan={2}>
                            <Label text="Type">
                                <Controller
                                    control={control}
                                    name="key.encoding"
                                    render={({
                                                field: {onChange, value,},
                                            }) => (
                                        <SingleSelect<PayloadEncoding | 'base64'>
                                            options={encodingOptions}
                                            value={value}
                                            onChange={onChange}
                                        />
                                    )}
                                />
                            </Label>
                        </GridItem>
                        <GridItem colSpan={2}>
                            {showKeySchemaSelection &&
                                <Label text="Schema">
                                    <Controller
                                        control={control}
                                        name="key.schemaName"
                                        render={({
                                                    field: {onChange, value,},
                                                }) => (
                                            <SingleSelect<string | undefined>
                                                options={availableValues.map((value) => ({key: value.name, value: value.name}))}
                                                value={value}
                                                onChange={newVal => {
                                                    onChange(newVal);

                                                    const detail = availableValues
                                                        .filter(value => value.name === newVal)
                                                        .first()
                                                    setValue('key.schemaVersion', detail?.latestActiveVersion)
                                                }}
                                            />
                                        )}
                                    />
                                </Label>
                            }
                        </GridItem>
                        <GridItem colSpan={1}>
                            {showKeySchemaSelection && <Label text="Version">
                                <Controller
                                    control={control}
                                    name="key.schemaVersion"
                                    render={({
                                                field: {onChange, value,},
                                            }) => (
                                        <SingleSelect<number | undefined>
                                            options={
                                                availableValues
                                                    .filter(value => value.name === keySchemaName)
                                                    .flatMap(value => value.versions)
                                                    .sort(({version: version1}, {version: version2}) => version2 - version1)
                                                    .map(({version}) => ({label: version, value: version}))
                                            }
                                            value={value}
                                            onChange={onChange}
                                        />
                                    )}
                                />
                            </Label>}
                        </GridItem>
                    </Grid>

                    {keyPayloadOptions.encoding === PayloadEncoding.PROTOBUF && <Label text="Index">
                        <>
                            {protoBufInfoElement}
                            <Input my={2} type="number" {...register('key.protobufIndex')} />
                        </>
                    </Label>}

                    <Label text="Data">
                        <Controller
                            control={control}
                            name="key.data"
                            render={({
                                        field: {onChange, value},
                                    }) => (
                                <KowlEditor
                                    onMount={setTheme}
                                    height={300}
                                    value={value}
                                    onChange={onChange}
                                    language={encodingToLanguage(keyPayloadOptions?.encoding)}
                                />
                            )}
                        />
                    </Label>
                </Flex>

                <Divider />

                <Flex gap={4} flexDirection="column">
                    <SectionHeading>Value</SectionHeading>
                    <Flex gap={2} flexDirection="column">
                        <Grid templateColumns="repeat(5, 1fr)" gap={2}>
                            <GridItem colSpan={2}>
                                <Label text="Type">
                                    <Controller
                                        control={control}
                                        name="value.encoding"
                                        render={({
                                                    field: {onChange, value,},
                                                }) => (
                                            <SingleSelect<PayloadEncoding | 'base64'>
                                                options={encodingOptions}
                                                value={value}
                                                onChange={onChange}
                                            />
                                        )}
                                    />
                                </Label>
                            </GridItem>
                            <GridItem colSpan={2}>
                                {showValueSchemaSelection && <Label text="Schema">
                                    <Controller
                                        control={control}
                                        name="value.schemaName"
                                        render={({
                                                    field: {onChange, value,},
                                                }) => (
                                            <SingleSelect<string | undefined>
                                                options={availableValues.map((value) => ({key: value.name, value: value.name}))}
                                                value={value}
                                                onChange={newVal => {
                                                    onChange(newVal);

                                                    const detail = availableValues
                                                        .filter(value => value.name === newVal)
                                                        .first()
                                                    setValue('value.schemaVersion', detail?.latestActiveVersion)
                                                }}
                                            />
                                        )}
                                    />
                                </Label>}
                            </GridItem>
                            <GridItem colSpan={1}>
                                {showValueSchemaSelection && <Label text="Version">
                                    <Controller
                                        control={control}
                                        name="value.schemaVersion"
                                        render={({
                                                    field: {onChange, value,},
                                                }) => (
                                            <SingleSelect<number | undefined>
                                                options={
                                                    availableValues
                                                        .filter(value => value.name === valueSchemaName)
                                                        .flatMap(value => value.versions)
                                                        .sort(({version: version1}, {version: version2}) => version2 - version1)
                                                        .map(({version}) => ({label: version, value: version}))
                                                }
                                                value={value}
                                                onChange={onChange}
                                            />
                                        )}
                                    />
                                </Label>}
                            </GridItem>
                        </Grid>

                        {valuePayloadOptions.encoding === PayloadEncoding.PROTOBUF && <Label text="Index">
                            <>
                                {protoBufInfoElement}
                                <Input my={2} type="number" {...register('value.protobufIndex')} />
                            </>
                        </Label>}

                        <Label text="Data">
                            <Controller
                                control={control}
                                name="value.data"
                                render={({
                                            field: {onChange, value},
                                        }) => (
                                    <KowlEditor
                                        onMount={setTheme}
                                        height={300}
                                        value={value}
                                        onChange={onChange}
                                        language={encodingToLanguage(valuePayloadOptions?.encoding)}
                                    />
                                )}
                            />
                        </Label>
                    </Flex>
                </Flex>

                {!!errors?.root?.serverError &&
                    <Alert status="error">
                        {errors.root.serverError.message}
                    </Alert>}

                <Flex gap={4} alignItems="center">
                    <Button type="submit" colorScheme="brand" isLoading={isSubmitting}>Produce</Button>
                    <Link to={`/topics/${encodeURIComponent(topicName)}`} as={ReactRouterLink}>Go Back</Link>
                </Flex>
            </Grid>
        </form>
    )
})


@observer
export class TopicProducePage extends PageComponent<{ topicName: string }> {
    initPage(p: PageInitHelper): void {
        const topicName = this.props.topicName;
        p.title = 'Produce'
        p.addBreadcrumb('Topics', '/topics');
        p.addBreadcrumb(topicName, '/topics/' + topicName);
        p.addBreadcrumb('Produce record', '/produce-record')
        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaSubjects(force);
    }

    render() {
        return (
            <Box>
                <Heading as="h1" noOfLines={1} py={2}>Produce Kafka record</Heading>
                <Text fontSize="lg">This will produce a single record to the <strong>{this.props.topicName}</strong> topic.</Text>

                <Box my={6}>
                    <PublishTopicForm topicName={this.props.topicName}/>
                </Box>
            </Box>
        )
    }
}


function setTheme(editor: IStandaloneCodeEditor, monaco: Monaco) {
    monaco.editor.defineTheme('kowl', {
        base: 'vs',
        inherit: true,
        colors: {
            'editor.background': '#fcfcfc',
            'editor.foreground': '#ff0000',

            'editorGutter.background': '#00000018',

            'editor.lineHighlightBackground': '#aaaaaa20',
            'editor.lineHighlightBorder': '#00000000',
            'editorLineNumber.foreground': '#8c98a8',

            'scrollbarSlider.background': '#ff0000',
            // "editorOverviewRuler.border": "#0000",
            'editorOverviewRuler.background': '#606060',
            'editorOverviewRuler.currentContentForeground': '#ff0000'
            //         background: #0001;
            // border-left: 1px solid #0002;
        },
        rules: []
    })
    monaco.editor.setTheme('kowl');
}
