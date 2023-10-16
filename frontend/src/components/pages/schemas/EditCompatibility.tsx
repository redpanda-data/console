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

import { useState } from 'react';
import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton, Button } from '../../../utils/tsxUtils';
import './Schema.List.scss';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { Box, CodeBlock, Empty, Flex, Grid, GridItem, Link, Stack, useToast, VStack, Text } from '@redpanda-data/ui';
import { Radio, RadioGroup } from '@chakra-ui/react';
import { SchemaRegistryCompatibilityMode } from '../../../state/restInterfaces';
import { getFormattedSchemaText, schemaTypeToCodeBlockLanguage } from './Schema.Details';

function renderNotConfigured() {
    return (
        <PageContent>
            <Section>
                <VStack gap={4}>
                    <Empty
                        description="Not Configured"
                    />
                    <Text textAlign="center">
                        Schema Registry is not configured in Redpanda Console.
                        <br />
                        To view all registered schemas, their documentation and their versioned history simply provide the connection credentials in the Redpanda Console config.
                    </Text>
                    {/* todo: fix link once we have a better guide */}
                    <a target="_blank" rel="noopener noreferrer" href="https://docs.redpanda.com/docs/manage/console/">
                        <Button variant="solid">Redpanda Console Config Documentation</Button>
                    </a>
                </VStack>
            </Section>
        </PageContent>
    );
}

@observer
class EditSchemaCompatibilityPage extends PageComponent<{ subjectName: string }> {

    initPage(p: PageInitHelper): void {
        p.title = 'Edit Schema Compatibility';
        p.addBreadcrumb('Schema Registry', '/schema-registry');
        p.addBreadcrumb('Edit Compatibility', '/schema-registry');
        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force?: boolean) {
        api.refreshSchemaCompatibilityConfig(force);
        api.refreshSchemaMode(force);
        const subjectName = this.props.subjectName
            ? decodeURIComponent(this.props.subjectName)
            : undefined;

        if (subjectName)
            api.refreshSchemaDetails(subjectName, force);
    }

    render() {
        if (api.schemaOverviewIsConfigured == false) return renderNotConfigured();
        if (!api.schemaMode) return DefaultSkeleton; // request in progress

        const subjectName = this.props.subjectName
            ? decodeURIComponent(this.props.subjectName)
            : undefined;

        return (
            <PageContent key="b">

                <EditSchemaCompatibility
                    subjectName={subjectName}
                    onClose={() => {
                        // Navigate back to the "caller" of the page, depending on what
                        // variant of the editCompatibility page we are on(can be global, or subject)
                        if (subjectName)
                            appGlobal.history.replace(`/schema-registry/subjects/${encodeURIComponent(subjectName)}`);
                        else
                            appGlobal.history.replace('/schema-registry');
                    }} />

            </PageContent>
        );
    }
}
export default EditSchemaCompatibilityPage;

function EditSchemaCompatibility(p: {
    subjectName?: string;
    onClose: () => void, // called after save/cancel
}) {
    const toast = useToast();
    const { subjectName } = p;
    const subject = subjectName != null
        ? api.schemaDetails.get(subjectName)
        : undefined;
    const schema = subject?.schemas.first(x => x.version == subject.latestActiveVersion);

    // type should be just "SchemaRegistryCompatibilityMode"
    const [configMode, setConfigMode] = useState(subjectName
        ? subject?.compatibility
        : api.schemaCompatibility
    );

    if (!configMode && subject) {
        // configMode is still undefined because earlier we didn't have "subject" ready.
        // Now subject is ready, so lets update it
        setConfigMode(subject.compatibility);
        return null;
    }
    const globalDefault = api.schemaCompatibility;
    if (!configMode && !subjectName && globalDefault) {
        // configMode is still undefined because we haven't gotten a response to the global default yet.
        // Now the global default is loaded, so lets set it
        setConfigMode(globalDefault);
        return null;
    }

    if (!configMode)
        return DefaultSkeleton;

    if (subjectName && !schema)
        return DefaultSkeleton;

    const onSave = () => {
        const changeReq = subjectName
            ? api.setSchemaRegistrySubjectCompatibilityMode(subjectName, configMode as SchemaRegistryCompatibilityMode)
            : api.setSchemaRegistryCompatibilityMode(configMode as SchemaRegistryCompatibilityMode)

        changeReq
            .then(async () => {
                toast({
                    status: 'success', duration: 4000, isClosable: false,
                    title: 'Compatibility mode updated to ' + configMode,
                });

                if (subjectName)
                    await api.refreshSchemaDetails(subjectName, true);
                else
                    await api.refreshSchemaCompatibilityConfig(true);

                p.onClose();
            })
            .catch(err => {
                toast({
                    status: 'error', duration: null, isClosable: true,
                    title: 'Failed to update compatibility mode',
                    description: String(err),
                })
            });
    };

    return <>
        <Text>Compatibility determines how schema validation occurs when producers are sending messages to Redpanda. <Link>Learn more.</Link></Text>

        <Grid templateColumns="1fr 1fr" gap="4rem">
            <GridItem mt="4" mb="8">

                <RadioGroup value={configMode}
                    onChange={e => {
                        setConfigMode(e);
                    }}
                >
                    <Stack gap="4">
                        {subject &&
                            <Radio value="DEFAULT">
                                Default
                                <Text fontSize="small">Use the globally configured default.</Text>
                            </Radio>
                        }

                        <Radio value="NONE">
                            None
                            <Text fontSize="small">No schema compatibility checks are done.</Text>
                        </Radio>

                        <Radio value="BACKWARD">
                            Backward
                            <Text fontSize="small">Consumers using the new schema (for example, version 10) can read data from producers using the previous schema (for example, version 9).</Text>
                        </Radio>

                        <Radio value="BACKWARD_TRANSITIVE">
                            Transitive Backward
                            <Text fontSize="small">Consumers using the new schema (for example, version 10) can read data from producers using all previous schemas (for example, versions 1-9).</Text>
                        </Radio>

                        <Radio value="FORWARD">
                            Forward
                            <Text fontSize="small">Consumers using the previous schema (for example, version 9) can read data from producers using the new schema (for example, version 10).</Text>
                        </Radio>

                        <Radio value="FORWARD_TRANSITIVE">
                            Transitive Forward
                            <Text fontSize="small">Consumers using any previous schema (for example, versions 1-9) can read data from producers using the new schema (for example, version 10).</Text>
                        </Radio>

                        <Radio value="FULL" >
                            Full
                            <Text fontSize="small">A new schema and the previous schema (for example, versions 10 and 9) are both backward and forward compatible with each other.</Text>
                        </Radio>

                        <Radio value="FULL_TRANSITIVE">
                            Transitive Full
                            <Text fontSize="small">Each schema is both backward and forward compatible with all registered schemas.</Text>
                        </Radio>
                    </Stack>
                </RadioGroup>

            </GridItem>

            <GridItem>
                {(subjectName && schema) && <>
                    <Text mt="4" fontSize="lg" fontWeight="bold">{subjectName}</Text>

                    <Text mt="8" mb="4" fontSize="lg" fontWeight="bold">Schema</Text>
                    <Box maxHeight="600px" overflow="scroll">
                        <CodeBlock
                            codeString={getFormattedSchemaText(schema)}
                            language={schemaTypeToCodeBlockLanguage(schema.type)}
                            theme="light"
                            showLineNumbers
                            showCopyButton={false}
                        />
                    </Box>
                </>}
            </GridItem>
        </Grid>

        <Flex gap="4">
            <Button colorScheme="brand" onClick={onSave} disabledReason={api.userData?.canManageSchemaRegistry === false ? 'You don\'t have the \'canManageSchemaRegistry\' permission' : undefined}>
                Save
            </Button>
            <Button variant="link" onClick={p.onClose}>Cancel</Button>
        </Flex>
    </>
}
