/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { PageComponent, PageInitHelper } from '../Page';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { observable } from 'mobx';
import { Box, Button, Flex, FormField, Heading, IconButton, Input, RadioGroup, useToast, Alert, AlertIcon } from '@redpanda-data/ui';
import { SingleSelect } from '../../misc/Select';
import KowlEditor from '../../misc/KowlEditor';
import { ElementOf } from '../../../utils/utils';
import { DeleteIcon } from '@chakra-ui/icons';
import { openSwitchSchemaFormatModal, openValidationErrorsModal } from './modals';
import { SchemaRegistryValidateSchemaResponse, SchemaType } from '../../../state/restInterfaces';
import { useState } from 'react';


@observer
export class SchemaCreatePage extends PageComponent<{}> {

    initPage(p: PageInitHelper): void {
        p.title = 'Create schema';
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb('Create schema', '/schema-registry');
        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaSubjects(force); // for references editor -> subject selector
        api.refreshTopics(force); // for the topics selector
    }

    editorState = createSchemaState();

    render() {
        return (
            <PageContent key="b">
                <Heading variant="xl">Create schema</Heading>

                <SchemaEditor state={this.editorState} mode="CREATE" />

                <SchemaPageButtons editorState={this.editorState} />
            </PageContent>
        );
    }
}

@observer
export class SchemaAddVersionPage extends PageComponent<{ subjectName: string }> {

    initPage(p: PageInitHelper): void {
        p.title = 'Add schema version';
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb('Create schema', '/schema-registry');
        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaCompatibilityConfig(force);
        api.refreshSchemaMode(force);
        api.refreshSchemaSubjects(force);
        api.refreshSchemaTypes(force);

        const subjectName = decodeURIComponent(this.props.subjectName);
        api.refreshSchemaDetails(subjectName, force);
    }

    editorState: SchemaEditorStateHelper | null = null;

    componentDidMount() {
        const subjectName = decodeURIComponent(this.props.subjectName);
        const subject = api.schemaDetails.get(subjectName);
        if (!subject) {
            api.refreshSchemaDetails(subjectName, true);
        }
    }

    render() {
        const subjectName = decodeURIComponent(this.props.subjectName);
        const subject = api.schemaDetails.get(subjectName);
        if (!subject)
            return DefaultSkeleton;

        if (this.editorState == null) {
            const schema = subject.schemas.first(x => x.version == subject.latestActiveVersion);
            if (!schema) {
                console.error('Cannot find last active schema version of subject', {
                    name: subject.name,
                    lastActiveVersion: subject.latestActiveVersion,
                    schemas: subject.schemas
                });
                return DefaultSkeleton;
            }

            // Initialize editor state from details
            this.editorState = createSchemaState();
            this.editorState.format = schema.type as 'AVRO' | 'PROTOBUF';
            this.editorState.keyOrValue = undefined;

            if (schema.type == SchemaType.AVRO || schema.type == SchemaType.JSON)
                schema.schema = JSON.stringify(JSON.parse(schema.schema), undefined, 4);

            this.editorState.schemaText = schema.schema;
            this.editorState.references = schema.references;
            this.editorState.strategy = 'CUSTOM';
            this.editorState.userInput = subject.name;
        }


        return (
            <PageContent key="b">
                <Heading variant="xl">Add schema version</Heading>

                <SchemaEditor state={this.editorState} mode="ADD_VERSION" />

                <SchemaPageButtons editorState={this.editorState} parentSubjectName={subjectName} />
            </PageContent>
        );
    }
}

/*
    This component is about the "Save", "Validate", and "Cancel" buttons at the bottom of the page.
    Those buttons are shared across both page variants, thus it was extracted into its own component
 */
const SchemaPageButtons = observer((p: {
    parentSubjectName?: string, // cancel button needs to know where to navigate to; was the page reached though 'New schema' or 'Add version'?
    editorState: SchemaEditorStateHelper
}) => {
    const toast = useToast();
    const [isValidating, setValidating] = useState(false);
    const [isCreating, setCreating] = useState(false);
    const { editorState } = p;
    const isMissingName = !editorState.computedSubjectName;

    return <Flex gap="4" mt="4">
        <Button colorScheme="brand" variant="solid"
            isDisabled={isCreating || isMissingName || isValidating}
            isLoading={isCreating}
            loadingText="Creating..."
            onClick={async () => {
                // We must validate first, "create" does not properly check and just gives internal server error if anything is wrong with the schema
                setValidating(true);
                const validationResponse = await validateSchema(editorState)
                    .finally(() => setValidating(false));

                if (!validationResponse.isValid || validationResponse.isCompatible === false) {
                    // Something is wrong with the schema, abort
                    toast({
                        status: 'error', duration: 4000, isClosable: false,
                        title: 'Error',
                        description: 'Schema validation failed'
                    });
                    return;
                }


                // try to create the schema
                setCreating(true);
                try {
                    const subjectName = editorState.computedSubjectName;
                    const r = await api.createSchema(editorState.computedSubjectName, {
                        schemaType: editorState.format as SchemaType,
                        schema: editorState.schemaText,
                        references: editorState.references.filter(x => x.name && x.subject)
                    }).finally(() => setCreating(false));


                    await api.refreshSchemaDetails(subjectName, true);

                    // success: navigate to details
                    const latestVersion = api.schemaDetails.get(subjectName)?.latestActiveVersion;
                    console.log('schema created', { response: r });
                    console.log('navigating to details', { subjectName, latestVersion });
                    appGlobal.history.replace(`/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=${latestVersion}`);

                } catch (err) {
                    // error: open modal
                    console.log('failed to create schema', { err });
                    toast({
                        status: 'error', duration: undefined, isClosable: true,
                        title: 'Error creating schema',
                        description: String(err)
                    });
                }
            }}>
            Save
        </Button>

        <Button variant="solid"
            isDisabled={isValidating || isMissingName || isValidating}
            isLoading={isValidating}
            loadingText="Validate"
            onClick={async () => {
                setValidating(true);
                const r = await validateSchema(editorState)
                    .finally(() => setValidating(false));

                if (r.isValid) {
                    toast({
                        status: 'success', duration: 4000, isClosable: false,
                        title: 'Schema validated successfully'
                    });
                } else {
                    openValidationErrorsModal(r);
                }
            }}>
            Validate
        </Button>

        <Button variant="link" onClick={() => {
            if (p.parentSubjectName)
                appGlobal.history.replace(`/schema-registry/subjects/${encodeURIComponent(p.parentSubjectName)}`);
            else
                appGlobal.history.replace('/schema-registry');
        }}>
            Cancel
        </Button>
    </Flex>
});

async function validateSchema(state: SchemaEditorStateHelper): Promise<{
    isValid: boolean, // is the schema valid at all (can be parsed, no unknown types etc)
    errorDetails?: string, // details about why the schema is not valid
    isCompatible?: boolean, // is the new schema not compatible with older versions; only set when the schema is valid
}> {

    if (!state.computedSubjectName)
        return { isValid: false, errorDetails: 'Missing subject name' };

    const r = await api.validateSchema(state.computedSubjectName, 'latest', {
        schemaType: state.format as SchemaType,
        schema: state.schemaText,
        references: state.references.filter(x => x.name && x.subject)
    }).catch(err => {
        return {
            compatibility: { isCompatible: false },
            isValid: false,
            parsingError: String(err)
        } as SchemaRegistryValidateSchemaResponse
    });

    return {
        isValid: r.isValid,
        errorDetails: r.parsingError,
        isCompatible: !r.isValid ? undefined : r.compatibility.isCompatible
    }
}


type NamingStrategy =
    | 'TOPIC' // only topic name
    | 'RECORD_NAME' // take name from the record
    | 'TOPIC_RECORD_NAME' // both topic and record name
    | 'CUSTOM' // essentially no strategy / arbitrary name
    ;


type SchemaEditorStateHelper = ReturnType<typeof createSchemaState>;

const SchemaEditor = observer((p: {
    state: SchemaEditorStateHelper,
    mode: 'CREATE' | 'ADD_VERSION'
}) => {
    const { state, mode } = p;
    const isAddVersion = mode == 'ADD_VERSION';

    const showTopicNameInput = state.strategy == 'TOPIC' || state.strategy == 'TOPIC_RECORD_NAME';
    const isCustom = state.strategy == 'CUSTOM';

    const formatOptions = [
        { value: 'AVRO', label: 'Avro' },
        { value: 'PROTOBUF', label: 'Protobuf' },
    ];
    if (api.schemaTypes?.includes('JSON'))
        formatOptions.push({ value: 'JSON', label: 'JSON' });

    return <>

        <Heading variant="lg">
            Settings
        </Heading>

        {isAddVersion && <Alert status="info">
            <AlertIcon />
            When adding a new schema version, the only thing that can be changed is the schema definition and its references. The rest of the fields have been disabled.
        </Alert>}

        <Flex direction="column" gap="8" maxWidth="650px">
            <Flex gap="8">
                <FormField label="Strategy">
                    <SingleSelect<NamingStrategy>
                        isDisabled={isAddVersion}
                        value={state.strategy}
                        options={[
                            { value: 'TOPIC', label: 'Topic Name' },
                            { value: 'RECORD_NAME', label: 'Record Name' },
                            { value: 'TOPIC_RECORD_NAME', label: 'Topic-Record Name' },
                            { value: 'CUSTOM', label: 'Custom' },
                        ]}
                        onChange={e => {
                            state.userInput = '';
                            state.strategy = e
                        }}
                    />
                </FormField>

                {showTopicNameInput
                    ? <FormField label="Topic name">
                        <SingleSelect
                            isDisabled={isAddVersion}
                            value={state.userInput}
                            onChange={e => state.userInput = e}
                            options={api.topics?.filter(x => !x.topicName.startsWith('_')).map(x => ({ value: x.topicName })) ?? []}
                        />
                    </FormField>
                    // We don't want "Strategy" to expand
                    : <Box width="100%" />
                }
            </Flex>

            <Flex gap="8">
                <FormField label="Key or value" width="auto" isInvalid={state.strategy === 'TOPIC' && state.userInput.length > 0 && !state.keyOrValue} errorText="Required">
                    <RadioGroup name="keyOrValue"
                        isDisabled={isAddVersion}
                        value={state.keyOrValue}
                        onChange={e => state.keyOrValue = e}
                        options={[
                            { value: 'KEY', label: 'Key' },
                            { value: 'VALUE', label: 'Value' },
                        ]}
                    />
                </FormField>

                <FormField label={isCustom
                    ? 'Subject name'
                    : 'Computed subject name'
                }
                    isInvalid={!state.computedSubjectName}
                    errorText="Subject name is required"
                >
                    <Input
                        value={state.computedSubjectName}
                        onChange={e => state.userInput = e.target.value}
                        isDisabled={!isCustom || isAddVersion}

                    />
                </FormField>
            </Flex>
        </Flex>

        <Heading variant="lg" mt="8">
            Schema definition
        </Heading>

        <Flex direction="column" gap="4" maxWidth="1000px">
            <FormField label="Format" >
                <RadioGroup name="format"
                    value={state.format}
                    onChange={e => {
                        if (state.format == e)
                            return;

                        // Let user confirm
                        openSwitchSchemaFormatModal(() => {
                            state.format = e;
                            if (e == 'AVRO')
                                state.schemaText = exampleSchema.avro;
                            else
                                state.schemaText = exampleSchema.protobuf;
                        })
                    }}
                    options={formatOptions}
                    isDisabled={isAddVersion}
                />
            </FormField>

            <KowlEditor
                value={state.schemaText}
                onChange={e => state.schemaText = e ?? ''}
                height="400px"

                language={state.format == 'PROTOBUF' ? 'proto' : 'json'}
            />

            <Heading variant="lg" mt="8">
                Schema references
            </Heading>
            {/* <Text>This is an example help text about the references list, to be updated later</Text> */}

            <ReferencesEditor state={state} />

        </Flex>
    </>
})


const ReferencesEditor = observer((p: { state: SchemaEditorStateHelper }) => {
    const { state } = p;
    const refs = state.references;

    const renderRow = (ref: ElementOf<typeof refs>) =>
        <Flex gap="4" alignItems="flex-end">
            <FormField label="Schema reference">
                <Input value={ref.name} onChange={e => ref.name = e.target.value} />
            </FormField>
            <FormField label="Subject">
                <SingleSelect
                    value={ref.subject}
                    onChange={async e => {
                        ref.subject = e;

                        let details = api.schemaDetails.get(e);
                        if (!details) {
                            await api.refreshSchemaDetails(e, true);
                            details = api.schemaDetails.get(e);
                        }

                        if (!details)
                            return; // failed to get details

                        // Need to make sure that, after refreshing, the subject is still the same
                        // otherwise, when the user switches between subjects very quickly, we might refresh 3 subjectDetails,
                        // and when the first one completes, we're setting its latest version, which now isn't valid for the outdated subject
                        if (ref.subject == e) {
                            ref.version = details.latestActiveVersion;
                        }
                    }}
                    options={api.schemaSubjects?.filter(x => !x.isSoftDeleted).map(x => ({ value: x.name })) ?? []}
                />
            </FormField>
            <FormField label="Version">
                <SingleSelect<number>
                    value={ref.version}
                    onChange={e => ref.version = e}
                    options={api.schemaDetails.get(ref.subject)?.versions.filter(v => !v.isSoftDeleted)?.map(x => ({ value: x.version })) ?? []}
                />
            </FormField>
            <IconButton aria-label="delete" icon={<DeleteIcon fontSize="19px" />} variant="ghost" onClick={() => refs.remove(ref)} />
        </Flex>

    return <Flex direction="column" gap="4" >

        {refs.map(x => renderRow(x))}

        <Button variant="outline"
            size="sm"
            width="fit-content"
            onClick={() => refs.push({ name: '', subject: '', version: 1 })}
        >
            Add reference
        </Button>
    </Flex>
})

function createSchemaState() {
    return observable({

        strategy: 'TOPIC' as
            | 'TOPIC' // only topic name
            | 'RECORD_NAME' // take name from the record
            | 'TOPIC_RECORD_NAME' // both topic and record name
            | 'CUSTOM', // essentially no strategy / arbitrary name
        userInput: '', // holds either topicName (for the two relevant topic-based strategies), or the custom input
        keyOrValue: undefined as 'KEY' | 'VALUE' | undefined,

        format: 'AVRO' as 'AVRO' | 'PROTOBUF' | 'JSON',
        schemaText: exampleSchema.avro,
        references: [
            { name: '', subject: '', version: 1 }
        ] as {
            name: string,
            subject: string,
            version: number
        }[],

        get computedSubjectName() {
            let subjectName = '';
            if (this.strategy == 'TOPIC') // was switch-case earlier, but if-cascade is actually more readable
                subjectName = this.userInput;
            else if (this.strategy == 'RECORD_NAME')
                subjectName = this.computeRecordName();
            else if (this.strategy == 'TOPIC_RECORD_NAME')
                subjectName = this.userInput + '-' + this.computeRecordName();
            else
                subjectName = this.userInput;

            if (this.strategy != 'CUSTOM')
                if (this.keyOrValue != undefined)
                    subjectName += '-' + this.keyOrValue.toLowerCase();

            return subjectName;
        },

        computeRecordName() {
            if (this.format == 'AVRO' || this.format == 'JSON') {
                // Avro
                // It's just a JSON object, so lets try to read the root name prop
                try {
                    const obj = JSON.parse(this.schemaText);
                    const name = obj['name'];
                    return name;
                } catch { }

                // The above will obviously only work when the schema is complete,
                // when the user is editting the text, it might not parse, so we fall back to regex matching
                const jsonNameRegex = /"name"\s*:\s*"(.*)"/;
                const ar = jsonNameRegex.exec(this.schemaText);
                if (!ar) return ''; // no match
                if (ar.length < 2) return ''; // capture group missing?
                return ar[1]; // return only first capture group

            } else {
                // Protobuf
                const messageNameRegex = /message\s+(\S+)\s*\{/;
                const ar = messageNameRegex.exec(this.schemaText);
                if (!ar) return ''; // no match
                if (ar.length < 2) return ''; // capture group missing?
                return ar[1]; // return only first capture group
            }
        }
    });
}


const exampleSchema = {
    avro: `
{
   "type": "record",
   "name": "car",
   "fields": [
      {
         "name": "model",
         "type": "string"
      },
      {
         "name": "make",
         "type": "string"
      },
      {
         "name": "year",
         "type": "float"
      }
   ]
}
`.trim(),

    protobuf: `
syntax = "proto3";

message Car {
   string make = 1;
   string model = 2;
   int32 year = 3;
}
`.trim(),
} as const;
