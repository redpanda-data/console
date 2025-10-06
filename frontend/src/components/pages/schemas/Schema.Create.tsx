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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useCreateSchemaMutation,
  useListSchemasQuery,
  useSchemaDetailsQuery,
  useSchemaTypesQuery,
  useValidateSchemaMutation,
} from '../../../react-query/api/schema';
import { useLegacyListTopicsQuery } from '../../../react-query/api/topic';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import { SchemaType } from '../../../state/restInterfaces';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import type { ElementOf } from '../../../utils/utils';
import KowlEditor from '../../misc/KowlEditor';
import PageContent from '../../misc/PageContent';
import { SingleSelect } from '../../misc/Select';
import { openSwitchSchemaFormatModal, openValidationErrorsModal } from './modals';

export const SchemaCreatePage = () => {
  const schemaSubjects = useListSchemasQuery();
  const schemaTypes = useSchemaTypesQuery();
  const topics = useLegacyListTopicsQuery(undefined, { hideInternalTopics: true });

  const editorState = useSchemaEditorState();

  useEffect(() => {
    appGlobal.onRefresh = () => {
      schemaSubjects.refetch();
      topics.refetch();
    };
  }, [schemaSubjects, topics]);

  return (
    <PageContent key="b">
      <Heading variant="xl">Create schema</Heading>

      <SchemaEditor
        state={editorState}
        mode="CREATE"
        schemaTypes={schemaTypes.data}
        topics={topics.data?.topics?.map((x) => x.topicName) ?? []}
        schemaSubjects={schemaSubjects.data?.filter((x) => !x.isSoftDeleted).map((x) => x.name) ?? []}
      />

      <SchemaPageButtons editorState={editorState} />
    </PageContent>
  );
};

export const SchemaAddVersionPage = ({ subjectName }: { subjectName: string }) => {
  const decodedSubjectName = decodeURIComponent(subjectName);
  const schemaDetails = useSchemaDetailsQuery(decodedSubjectName);
  const schemaSubjects = useListSchemasQuery();
  const schemaTypes = useSchemaTypesQuery();

  const subject = schemaDetails.data;

  const editorState = useSchemaEditorState();

  // Initialize editor state from schema details
  useEffect(() => {
    if (!subject) return;

    const schema = subject.schemas.find((x) => x.version === subject.latestActiveVersion);
    if (!schema) {
      console.error('Cannot find last active schema version of subject', {
        name: subject.name,
        lastActiveVersion: subject.latestActiveVersion,
        schemas: subject.schemas,
      });
      return;
    }

    editorState.setFormat(schema.type as 'AVRO' | 'PROTOBUF' | 'JSON');
    editorState.setKeyOrValue(undefined);

    let schemaText = schema.schema;
    if (schema.type === SchemaType.AVRO || schema.type === SchemaType.JSON) {
      schemaText = JSON.stringify(JSON.parse(schema.schema), undefined, 4);
    }

    editorState.setSchemaText(schemaText);
    editorState.setReferences(schema.references);
    editorState.setStrategy('CUSTOM');
    editorState.setUserInput(subject.name);
  }, [subject, editorState]);

  useEffect(() => {
    appGlobal.onRefresh = () => {
      schemaDetails.refetch();
      schemaSubjects.refetch();
      schemaTypes.refetch();
    };
  }, [schemaDetails, schemaSubjects, schemaTypes]);

  if (schemaDetails.isLoading || !subject) return DefaultSkeleton;

  return (
    <PageContent key="b">
      <Heading variant="xl">Add schema version</Heading>

      <SchemaEditor
        state={editorState}
        mode="ADD_VERSION"
        schemaTypes={schemaTypes.data}
        topics={[]}
        schemaSubjects={schemaSubjects.data?.filter((x) => !x.isSoftDeleted).map((x) => x.name) ?? []}
      />

      <SchemaPageButtons editorState={editorState} parentSubjectName={decodedSubjectName} />
    </PageContent>
  );
};

/*
    This component is about the "Save", "Validate", and "Cancel" buttons at the bottom of the page.
    Those buttons are shared across both page variants, thus it was extracted into its own component
 */
const SchemaPageButtons = (p: {
  parentSubjectName?: string; // cancel button needs to know where to navigate to; was the page reached though 'New schema' or 'Add version'?
  editorState: ReturnType<typeof useSchemaEditorState>;
}) => {
  const toast = useToast();
  const navigate = useNavigate();
  const createSchema = useCreateSchemaMutation();
  const validateSchema = useValidateSchemaMutation();
  const schemaDetails = useSchemaDetailsQuery(p.editorState.computedSubjectName, { enabled: false });
  const { editorState } = p;
  const isMissingName = !editorState.computedSubjectName;

  const handleValidate = async () => {
    if (!editorState.computedSubjectName) return;

    const result = await validateSchema.mutateAsync({
      subjectName: editorState.computedSubjectName,
      version: 'latest',
      schemaType: editorState.format as SchemaType,
      schema: editorState.schemaText,
      references: editorState.references.filter((x) => x.name && x.subject),
    });

    if (result.isValid) {
      toast({
        status: 'success',
        duration: 4000,
        isClosable: false,
        title: 'Schema validated successfully',
      });
    } else {
      openValidationErrorsModal({
        isValid: result.isValid,
        errorDetails: result.parsingError,
        isCompatible: result.compatibility.isCompatible,
      });
    }
  };

  const handleCreate = async () => {
    if (!editorState.computedSubjectName) return;

    // We must validate first
    const validationResponse = await validateSchema.mutateAsync({
      subjectName: editorState.computedSubjectName,
      version: 'latest',
      schemaType: editorState.format as SchemaType,
      schema: editorState.schemaText,
      references: editorState.references.filter((x) => x.name && x.subject),
    });

    if (!validationResponse.isValid || validationResponse.compatibility.isCompatible === false) {
      openValidationErrorsModal({
        isValid: validationResponse.isValid,
        errorDetails: validationResponse.parsingError,
        isCompatible: validationResponse.compatibility.isCompatible,
      });
      return;
    }

    // Try to create the schema
    try {
      const subjectName = editorState.computedSubjectName;
      await createSchema.mutateAsync({
        subjectName,
        schemaType: editorState.format as SchemaType,
        schema: editorState.schemaText,
        references: editorState.references.filter((x) => x.name && x.subject),
      });

      // Fetch the latest version
      await schemaDetails.refetch();
      const latestVersion = schemaDetails.data?.latestActiveVersion;

      navigate(`/schema-registry/subjects/${encodeURIComponent(subjectName)}?version=${latestVersion}`);
    } catch (err) {
      toast({
        status: 'error',
        duration: undefined,
        isClosable: true,
        title: 'Error creating schema',
        description: String(err),
      });
    }
  };

  return (
    <Flex gap="4" mt="4">
      <Button
        colorScheme="brand"
        variant="solid"
        isDisabled={
          createSchema.isPending || isMissingName || validateSchema.isPending || editorState.isInvalidKeyOrValue
        }
        isLoading={createSchema.isPending}
        loadingText="Creating..."
        onClick={handleCreate}
      >
        Save
      </Button>

      <Button
        variant="solid"
        isDisabled={validateSchema.isPending || isMissingName || editorState.isInvalidKeyOrValue}
        isLoading={validateSchema.isPending}
        loadingText="Validate"
        onClick={handleValidate}
      >
        Validate
      </Button>

      <Button
        variant="link"
        onClick={() => {
          if (p.parentSubjectName) navigate(`/schema-registry/subjects/${encodeURIComponent(p.parentSubjectName)}`);
          else navigate('/schema-registry');
        }}
      >
        Cancel
      </Button>
    </Flex>
  );
};

type NamingStrategy =
  | 'TOPIC' // only topic name
  | 'RECORD_NAME' // take name from the record
  | 'TOPIC_RECORD_NAME' // both topic and record name
  | 'CUSTOM'; // essentially no strategy / arbitrary name

const SchemaEditor = (p: {
  state: ReturnType<typeof useSchemaEditorState>;
  mode: 'CREATE' | 'ADD_VERSION';
  schemaTypes?: string[];
  topics: string[];
  schemaSubjects: string[];
}) => {
  const { state, mode, schemaTypes, topics, schemaSubjects } = p;
  const isAddVersion = mode === 'ADD_VERSION';

  const showTopicNameInput = state.strategy === 'TOPIC' || state.strategy === 'TOPIC_RECORD_NAME';
  const isCustom = state.strategy === 'CUSTOM';

  const formatOptions = [
    { value: 'AVRO', label: 'Avro' },
    { value: 'PROTOBUF', label: 'Protobuf' },
  ];

  if (schemaTypes?.includes('JSON')) {
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
              value={state.strategy}
              options={[
                { value: 'TOPIC', label: 'Topic Name' },
                { value: 'RECORD_NAME', label: 'Record Name' },
                { value: 'TOPIC_RECORD_NAME', label: 'Topic-Record Name' },
                { value: 'CUSTOM', label: 'Custom' },
              ]}
              onChange={(e) => {
                state.setUserInput('');
                state.setStrategy(e);
              }}
            />
          </FormField>

          {showTopicNameInput ? (
            <FormField label="Topic name">
              <SingleSelect
                isDisabled={isAddVersion}
                value={state.userInput}
                onChange={(e) => state.setUserInput(e)}
                options={topics.map((x) => ({ value: x }))}
              />
            </FormField>
          ) : (
            // We don't want "Strategy" to expand
            <Box width="100%" />
          )}
        </Flex>

        <Flex gap="8">
          <FormField label="Key or value" width="auto" isInvalid={state.isInvalidKeyOrValue} errorText="Required">
            <RadioGroup
              name="keyOrValue"
              isDisabled={isAddVersion}
              value={state.keyOrValue}
              onChange={(e) => state.setKeyOrValue(e)}
              options={[
                { value: 'KEY', label: 'Key' },
                { value: 'VALUE', label: 'Value' },
              ]}
            />
          </FormField>

          <FormField
            label={isCustom ? 'Subject name' : 'Computed subject name'}
            isInvalid={!state.computedSubjectName}
            errorText="Subject name is required"
          >
            <Input
              value={state.computedSubjectName}
              onChange={(e) => state.setUserInput(e.target.value)}
              isDisabled={!isCustom || isAddVersion}
            />
          </FormField>
        </Flex>
      </Flex>

      <Heading variant="lg" mt="8">
        Schema definition
      </Heading>

      <Flex direction="column" gap="4" maxWidth="1000px">
        <FormField label="Format">
          <RadioGroup
            name="format"
            value={state.format}
            onChange={(e: 'AVRO' | 'PROTOBUF' | 'JSON') => {
              if (state.format === e) {
                return;
              }

              // Let user confirm
              openSwitchSchemaFormatModal(() => {
                state.setFormat(e);
                state.setSchemaText(exampleSchema[e]);
              });
            }}
            options={formatOptions}
            isDisabled={isAddVersion}
          />
        </FormField>

        <KowlEditor
          value={state.schemaText}
          onChange={(e) => state.setSchemaText(e ?? '')}
          height="400px"
          language={state.format === 'PROTOBUF' ? 'proto' : 'json'}
        />

        <Heading variant="lg" mt="8">
          Schema references
        </Heading>

        <ReferencesEditor state={state} schemaSubjects={schemaSubjects} />
      </Flex>
    </>
  );
};

const ReferencesEditor = (p: { state: ReturnType<typeof useSchemaEditorState>; schemaSubjects: string[] }) => {
  const { state, schemaSubjects } = p;
  const refs = state.references;

  const renderRow = (ref: ElementOf<typeof refs>, index: number) => (
    <Flex key={index} gap="4" alignItems="flex-end">
      <FormField label="Schema reference">
        <Input value={ref.name} onChange={(e) => state.updateReference(index, { name: e.target.value })} />
      </FormField>
      <FormField label="Subject">
        <SingleSelect
          value={ref.subject}
          onChange={async (e) => {
            state.updateReference(index, { subject: e });

            let details = api.schemaDetails.get(e);
            if (!details) {
              await api.refreshSchemaDetails(e, true);
              details = api.schemaDetails.get(e);
            }

            if (!details) return;

            // Need to make sure that, after refreshing, the subject is still the same
            if (state.references[index].subject === e) {
              state.updateReference(index, { version: details.latestActiveVersion });
            }
          }}
          options={schemaSubjects.map((x) => ({ value: x }))}
        />
      </FormField>
      <FormField label="Version">
        <SingleSelect<number>
          value={ref.version}
          onChange={(e) => state.updateReference(index, { version: e })}
          options={
            api.schemaDetails
              .get(ref.subject)
              ?.versions.filter((v) => !v.isSoftDeleted)
              ?.map((x) => ({ value: x.version })) ?? []
          }
        />
      </FormField>
      <IconButton
        aria-label="delete"
        icon={<DeleteIcon fontSize="19px" />}
        variant="ghost"
        onClick={() => state.removeReference(index)}
      />
    </Flex>
  );

  return (
    <Flex direction="column" gap="4">
      {refs.map((x, i) => renderRow(x, i))}

      <Button
        variant="outline"
        size="sm"
        width="fit-content"
        onClick={() => state.addReference({ name: '', subject: '', version: 1 })}
      >
        Add reference
      </Button>
    </Flex>
  );
};

function useSchemaEditorState() {
  const [strategy, setStrategy] = useState<NamingStrategy>('TOPIC');
  const [userInput, setUserInput] = useState('');
  const [keyOrValue, setKeyOrValue] = useState<'KEY' | 'VALUE' | undefined>(undefined);
  const [format, setFormat] = useState<'AVRO' | 'PROTOBUF' | 'JSON'>('AVRO');
  const [schemaText, setSchemaText] = useState(exampleSchema.AVRO);
  const [references, setReferences] = useState<{ name: string; subject: string; version: number }[]>([
    { name: '', subject: '', version: 1 },
  ]);

  const computeRecordName = useCallback(() => {
    if (format === 'AVRO' || format === 'JSON') {
      // Avro/JSON: try to read the root name prop
      try {
        const obj = JSON.parse(schemaText);
        return obj.name;
      } catch {}

      // Fallback to regex matching
      const jsonNameRegex = /"name"\s*:\s*"(.*)"/;
      const ar = jsonNameRegex.exec(schemaText);
      if (!ar || ar.length < 2) return '';
      return ar[1];
    }
    // Protobuf
    const messageNameRegex = /message\s+(\S+)\s*\{/;
    const ar = messageNameRegex.exec(schemaText);
    if (!ar || ar.length < 2) return '';
    return ar[1];
  }, [format, schemaText]);

  const isInvalidKeyOrValue = strategy === 'TOPIC' && userInput.length > 0 && !keyOrValue;

  const computedSubjectName = useMemo(() => {
    const recordName = computeRecordName();
    let subjectName = '';

    if (strategy === 'TOPIC') {
      subjectName = userInput;
    } else if (strategy === 'RECORD_NAME') {
      subjectName = recordName;
    } else if (strategy === 'TOPIC_RECORD_NAME') {
      subjectName = `${userInput}-${recordName}`;
    } else {
      subjectName = userInput;
    }

    if (strategy !== 'CUSTOM' && keyOrValue) {
      subjectName += `-${keyOrValue.toLowerCase()}`;
    }

    return subjectName;
  }, [strategy, userInput, keyOrValue, computeRecordName]);

  const addReference = (ref: { name: string; subject: string; version: number }) => {
    setReferences([...references, ref]);
  };

  const removeReference = (index: number) => {
    setReferences(references.filter((_, i) => i !== index));
  };

  const updateReference = (index: number, updates: Partial<{ name: string; subject: string; version: number }>) => {
    setReferences(references.map((ref, i) => (i === index ? { ...ref, ...updates } : ref)));
  };

  return {
    strategy,
    setStrategy,
    userInput,
    setUserInput,
    keyOrValue,
    setKeyOrValue,
    format,
    setFormat,
    schemaText,
    setSchemaText,
    references,
    setReferences,
    addReference,
    removeReference,
    updateReference,
    isInvalidKeyOrValue,
    computedSubjectName,
  };
}

const exampleSchema: Record<SchemaType, string> = {
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
