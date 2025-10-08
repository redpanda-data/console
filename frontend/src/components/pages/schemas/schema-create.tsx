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

import { DeleteIcon } from '@chakra-ui/icons';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormField,
  Heading,
  IconButton,
  Input,
  RadioGroup,
  useToast,
} from '@redpanda-data/ui';
import { observable } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useState } from 'react';

import { openSwitchSchemaFormatModal, openValidationErrorsModal } from './modals';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import {
  type SchemaRegistryValidateSchemaResponse,
  SchemaType,
  type SchemaTypeType,
} from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import type { ElementOf } from '../../../utils/utils';
import KowlEditor from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { PageComponent, type PageInitHelper } from '../page';

// Regex for extracting record names from schema text
const JSON_NAME_REGEX = /"name"\s*:\s*"(.*)"/;
const PROTOBUF_MESSAGE_NAME_REGEX = /message\s+(\S+)\s*\{/;

@observer
export class SchemaCreatePage extends PageComponent {
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

        <SchemaEditor mode="CREATE" state={this.editorState} />

        <SchemaPageButtons editorState={this.editorState} />
      </PageContent>
    );
  }
}

@observer
export class SchemaAddVersionPage extends PageComponent<{ subjectName: string }> {
  initPage(p: PageInitHelper): void {
    const subjectName = this.props.subjectName;
    p.title = 'Add schema version';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    p.addBreadcrumb(subjectName, `/schema-registry/subjects/${subjectName}`, undefined, {
      canBeTruncated: true,
    });
    p.addBreadcrumb('Create schema', `/schema-registry/subjects/${subjectName}/add-version`);
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig();
    api.refreshSchemaMode();
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
    if (!subject) {
      return DefaultSkeleton;
    }

    if (this.editorState == null) {
      const schema = subject.schemas.first((x) => x.version === subject.latestActiveVersion);
      if (!schema) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('Cannot find last active schema version of subject', {
          name: subject.name,
          lastActiveVersion: subject.latestActiveVersion,
          schemas: subject.schemas,
        });
        return DefaultSkeleton;
      }

      // Initialize editor state from details
      this.editorState = createSchemaState();
      this.editorState.format = schema.type as 'AVRO' | 'PROTOBUF';
      this.editorState.keyOrValue = undefined;

      if (schema.type === SchemaType.AVRO || schema.type === SchemaType.JSON) {
        schema.schema = JSON.stringify(JSON.parse(schema.schema), undefined, 4);
      }

      this.editorState.schemaText = schema.schema;
      this.editorState.references = schema.references;
      this.editorState.strategy = 'CUSTOM';
      this.editorState.userInput = subject.name;
    }

    return (
      <PageContent key="b">
        <Heading variant="xl">Add schema version</Heading>

        <SchemaEditor mode="ADD_VERSION" state={this.editorState} />

        <SchemaPageButtons editorState={this.editorState} parentSubjectName={subjectName} />
      </PageContent>
    );
  }
}

/*
    This component is about the "Save", "Validate", and "Cancel" buttons at the bottom of the page.
    Those buttons are shared across both page variants, thus it was extracted into its own component
 */
const SchemaPageButtons = observer(
  (p: {
    parentSubjectName?: string; // cancel button needs to know where to navigate to; was the page reached though 'New schema' or 'Add version'?
    editorState: SchemaEditorStateHelper;
  }) => {
    const toast = useToast();
    const [isValidating, setValidating] = useState(false);
    const [isCreating, setCreating] = useState(false);
    const { editorState } = p;
    const isMissingName = !editorState.computedSubjectName;

    return (
      <Flex gap="4" mt="4">
        <Button
          colorScheme="brand"
          isDisabled={isCreating || isMissingName || isValidating || editorState.isInvalidKeyOrValue}
          isLoading={isCreating}
          loadingText="Creating..."
          onClick={async () => {
            // We must validate first, "create" does not properly check and just gives internal server error if anything is wrong with the schema
            setValidating(true);
            const validationResponse = await validateSchema(editorState).finally(() => setValidating(false));

            if (!validationResponse.isValid || validationResponse.isCompatible === false) {
              // Something is wrong with the schema, abort
              openValidationErrorsModal(validationResponse);
              return;
            }

            // try to create the schema
            setCreating(true);
            try {
              const subjectName = editorState.computedSubjectName;
              const r = await api
                .createSchema(editorState.computedSubjectName, {
                  schemaType: editorState.format as SchemaTypeType,
                  schema: editorState.schemaText,
                  references: editorState.references.filter((x) => x.name && x.subject),
                })
                .finally(() => setCreating(false));

              await api.refreshSchemaDetails(subjectName, true);

              // success: navigate to details
              const latestVersion = api.schemaDetails.get(subjectName)?.latestActiveVersion;
              // biome-ignore lint/suspicious/noConsole: intentional console usage
              console.log('schema created', { response: r });
              // biome-ignore lint/suspicious/noConsole: intentional console usage
              console.log('navigating to details', { subjectName, latestVersion });
              appGlobal.historyReplace(
                `/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=${latestVersion}`
              );
            } catch (err) {
              // error: open modal
              // biome-ignore lint/suspicious/noConsole: intentional console usage
              console.log('failed to create schema', { err });
              toast({
                status: 'error',
                duration: undefined,
                isClosable: true,
                title: 'Error creating schema',
                description: String(err),
              });
            }
          }}
          variant="solid"
        >
          Save
        </Button>

        <Button
          isDisabled={isValidating || isMissingName || isValidating || editorState.isInvalidKeyOrValue}
          isLoading={isValidating}
          loadingText="Validate"
          onClick={async () => {
            setValidating(true);
            const r = await validateSchema(editorState).finally(() => setValidating(false));

            if (r.isValid) {
              toast({
                status: 'success',
                duration: 4000,
                isClosable: false,
                title: 'Schema validated successfully',
              });
            } else {
              openValidationErrorsModal(r);
            }
          }}
          variant="solid"
        >
          Validate
        </Button>

        <Button
          onClick={() => {
            if (p.parentSubjectName) {
              appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(p.parentSubjectName)}`);
            } else {
              appGlobal.historyReplace('/schema-registry');
            }
          }}
          variant="link"
        >
          Cancel
        </Button>
      </Flex>
    );
  }
);

async function validateSchema(state: SchemaEditorStateHelper): Promise<{
  isValid: boolean; // is the schema valid at all (can be parsed, no unknown types etc)
  errorDetails?: string; // details about why the schema is not valid
  isCompatible?: boolean; // is the new schema not compatible with older versions; only set when the schema is valid
}> {
  if (!state.computedSubjectName) {
    return { isValid: false, errorDetails: 'Missing subject name' };
  }

  const r = await api
    .validateSchema(state.computedSubjectName, 'latest', {
      schemaType: state.format as SchemaTypeType,
      schema: state.schemaText,
      references: state.references.filter((x) => x.name && x.subject),
    })
    .catch(
      (err) =>
        ({
          compatibility: { isCompatible: false },
          isValid: false,
          parsingError: String(err),
        }) as SchemaRegistryValidateSchemaResponse
    );

  return {
    isValid: r.isValid,
    errorDetails: r.parsingError,
    isCompatible: r.isValid ? r.compatibility.isCompatible : undefined,
  };
}

type NamingStrategy =
  | 'TOPIC' // only topic name
  | 'RECORD_NAME' // take name from the record
  | 'TOPIC_RECORD_NAME' // both topic and record name
  | 'CUSTOM'; // essentially no strategy / arbitrary name

type SchemaEditorStateHelper = ReturnType<typeof createSchemaState>;

const SchemaEditor = observer((p: { state: SchemaEditorStateHelper; mode: 'CREATE' | 'ADD_VERSION' }) => {
  useEffect(() => {
    api.refreshSchemaTypes(true);
  }, []);

  const { state, mode } = p;
  const isAddVersion = mode === 'ADD_VERSION';

  const showTopicNameInput = state.strategy === 'TOPIC' || state.strategy === 'TOPIC_RECORD_NAME';
  const isCustom = state.strategy === 'CUSTOM';

  const formatOptions = [
    { value: 'AVRO', label: 'Avro' },
    { value: 'PROTOBUF', label: 'Protobuf' },
  ];

  if (api.schemaTypes?.includes('JSON')) {
    formatOptions.push({ value: 'JSON', label: 'JSON' });
  }

  return (
    <>
      <Heading variant="lg">Settings</Heading>

      {isAddVersion && (
        <Alert status="info">
          <AlertIcon />
          When adding a new schema version, the only thing that can be changed is the schema definition and its
          references. The rest of the fields have been disabled.
        </Alert>
      )}

      <Flex direction="column" gap="8" maxWidth="650px">
        <Flex gap="8">
          <FormField label="Strategy">
            <SingleSelect<NamingStrategy>
              isDisabled={isAddVersion}
              onChange={(e) => {
                state.userInput = '';
                state.strategy = e;
              }}
              options={[
                { value: 'TOPIC', label: 'Topic Name' },
                { value: 'RECORD_NAME', label: 'Record Name' },
                { value: 'TOPIC_RECORD_NAME', label: 'Topic-Record Name' },
                { value: 'CUSTOM', label: 'Custom' },
              ]}
              value={state.strategy}
            />
          </FormField>

          {showTopicNameInput ? (
            <FormField label="Topic name">
              <SingleSelect
                isDisabled={isAddVersion}
                onChange={(e) => (state.userInput = e)}
                options={
                  api.topics?.filter((x) => !x.topicName.startsWith('_')).map((x) => ({ value: x.topicName })) ?? []
                }
                value={state.userInput}
              />
            </FormField>
          ) : (
            // We don't want "Strategy" to expand
            <Box width="100%" />
          )}
        </Flex>

        <Flex gap="8">
          <FormField errorText="Required" isInvalid={state.isInvalidKeyOrValue} label="Key or value" width="auto">
            <RadioGroup
              isDisabled={isAddVersion}
              name="keyOrValue"
              onChange={(e) => (state.keyOrValue = e)}
              options={[
                { value: 'KEY', label: 'Key' },
                { value: 'VALUE', label: 'Value' },
              ]}
              value={state.keyOrValue}
            />
          </FormField>

          <FormField
            errorText="Subject name is required"
            isInvalid={!state.computedSubjectName}
            label={isCustom ? 'Subject name' : 'Computed subject name'}
          >
            <Input
              isDisabled={!isCustom || isAddVersion}
              onChange={(e) => (state.userInput = e.target.value)}
              value={state.computedSubjectName}
            />
          </FormField>
        </Flex>
      </Flex>

      <Heading mt="8" variant="lg">
        Schema definition
      </Heading>

      <Flex direction="column" gap="4" maxWidth="1000px">
        <FormField label="Format">
          <RadioGroup
            isDisabled={isAddVersion}
            name="format"
            onChange={(e) => {
              if (state.format === e) {
                return;
              }

              // Let user confirm
              openSwitchSchemaFormatModal(() => {
                state.format = e;
                state.schemaText = exampleSchema[state.format];
              });
            }}
            options={formatOptions}
            value={state.format}
          />
        </FormField>

        <KowlEditor
          height="400px"
          language={state.format === 'PROTOBUF' ? 'proto' : 'json'}
          onChange={(e) => (state.schemaText = e ?? '')}
          value={state.schemaText}
        />

        <Heading mt="8" variant="lg">
          Schema references
        </Heading>
        {/* <Text>This is an example help text about the references list, to be updated later</Text> */}

        <ReferencesEditor state={state} />
      </Flex>
    </>
  );
});

const ReferencesEditor = observer((p: { state: SchemaEditorStateHelper }) => {
  const { state } = p;
  const refs = state.references;

  const renderRow = (ref: ElementOf<typeof refs>) => (
    <Flex alignItems="flex-end" gap="4">
      <FormField label="Schema reference">
        <Input onChange={(e) => (ref.name = e.target.value)} value={ref.name} />
      </FormField>
      <FormField label="Subject">
        <SingleSelect
          onChange={async (e) => {
            ref.subject = e;

            let details = api.schemaDetails.get(e);
            if (!details) {
              await api.refreshSchemaDetails(e, true);
              details = api.schemaDetails.get(e);
            }

            if (!details) {
              return; // failed to get details
            }

            // Need to make sure that, after refreshing, the subject is still the same
            // otherwise, when the user switches between subjects very quickly, we might refresh 3 subjectDetails,
            // and when the first one completes, we're setting its latest version, which now isn't valid for the outdated subject
            if (ref.subject === e) {
              ref.version = details.latestActiveVersion;
            }
          }}
          options={api.schemaSubjects?.filter((x) => !x.isSoftDeleted).map((x) => ({ value: x.name })) ?? []}
          value={ref.subject}
        />
      </FormField>
      <FormField label="Version">
        <SingleSelect<number>
          onChange={(e) => (ref.version = e)}
          options={
            api.schemaDetails
              .get(ref.subject)
              ?.versions.filter((v) => !v.isSoftDeleted)
              ?.map((x) => ({ value: x.version })) ?? []
          }
          value={ref.version}
        />
      </FormField>
      <IconButton
        aria-label="delete"
        icon={<DeleteIcon fontSize="19px" />}
        onClick={() => refs.remove(ref)}
        variant="ghost"
      />
    </Flex>
  );

  return (
    <Flex direction="column" gap="4">
      {refs.map((x) => renderRow(x))}

      <Button
        onClick={() => refs.push({ name: '', subject: '', version: 1 })}
        size="sm"
        variant="outline"
        width="fit-content"
      >
        Add reference
      </Button>
    </Flex>
  );
});

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
    schemaText: exampleSchema.AVRO,
    references: [{ name: '', subject: '', version: 1 }] as {
      name: string;
      subject: string;
      version: number;
    }[],

    get isInvalidKeyOrValue() {
      return this.strategy === 'TOPIC' && this.userInput.length > 0 && !this.keyOrValue;
    },

    get computedSubjectName() {
      let subjectName = '';
      if (this.strategy === 'TOPIC') {
        // was switch-case earlier, but if-cascade is actually more readable
        subjectName = this.userInput;
      } else if (this.strategy === 'RECORD_NAME') {
        subjectName = this.computeRecordName();
      } else if (this.strategy === 'TOPIC_RECORD_NAME') {
        subjectName = `${this.userInput}-${this.computeRecordName()}`;
      } else {
        subjectName = this.userInput;
      }

      if (this.strategy !== 'CUSTOM' && this.keyOrValue !== undefined) {
        subjectName += `-${this.keyOrValue.toLowerCase()}`;
      }

      return subjectName;
    },

    computeRecordName() {
      if (this.format === 'AVRO' || this.format === 'JSON') {
        // Avro
        // It's just a JSON object, so lets try to read the root name prop
        try {
          const obj = JSON.parse(this.schemaText);
          const name = obj.name;
          return name;
        } catch {
          // no op - schema may be incomplete during editing
        }

        // The above will obviously only work when the schema is complete,
        // when the user is editting the text, it might not parse, so we fall back to regex matching
        const ar = JSON_NAME_REGEX.exec(this.schemaText);
        if (!ar) {
          return ''; // no match
        }
        if (ar.length < 2) {
          return ''; // capture group missing?
        }
        return ar[1]; // return only first capture group
      }
      // Protobuf
      const ar = PROTOBUF_MESSAGE_NAME_REGEX.exec(this.schemaText);
      if (!ar) {
        return ''; // no match
      }
      if (ar.length < 2) {
        return ''; // capture group missing?
      }
      return ar[1]; // return only first capture group
    },
  });
}

const exampleSchema: Record<SchemaTypeType, string> = {
  AVRO: `
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

  PROTOBUF: `
syntax = "proto3";

message Car {
   string make = 1;
   string model = 2;
   int32 year = 3;
}
`.trim(),

  JSON: `
    {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    }
  },
  "required": ["name"],
  "additionalProperties": false
}
    `.trim(),
} as const;
