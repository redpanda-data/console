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
import { useState } from 'react';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { Button, DefaultSkeleton } from '../../../utils/tsx-utils';
import { PageComponent, type PageInitHelper } from '../page';
import './Schema.List.scss';
import { Box, CodeBlock, Empty, Flex, Grid, GridItem, RadioGroup, Text, useToast, VStack } from '@redpanda-data/ui';

import { getFormattedSchemaText, schemaTypeToCodeBlockLanguage } from './schema-details';
import type { SchemaRegistryCompatibilityMode } from '../../../state/rest-interfaces';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';

function renderNotConfigured() {
  return (
    <PageContent>
      <Section>
        <VStack gap={4}>
          <Empty description="Not Configured" />
          <Text textAlign="center">
            Schema Registry is not configured in Redpanda Console.
            <br />
            To view all registered schemas, their documentation and their versioned history simply provide the
            connection credentials in the Redpanda Console config.
          </Text>
          {/* todo: fix link once we have a better guide */}
          <a href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
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
    const subjectName = this.props.subjectName;

    p.title = 'Edit Schema Compatibility';
    p.addBreadcrumb('Schema Registry', '/schema-registry');
    if (subjectName) {
      p.addBreadcrumb(subjectName, `/schema-registry/subjects/${subjectName}`, undefined, {
        canBeTruncated: true,
      });
      p.addBreadcrumb('Edit Compatibility', `/schema-registry/subjects/${subjectName}/edit-compatibility`);
    } else {
      p.addBreadcrumb('Edit Compatibility', '/schema-registry/edit-compatibility');
    }
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force?: boolean) {
    api.refreshSchemaCompatibilityConfig();
    api.refreshSchemaMode();
    const subjectName = this.props.subjectName ? decodeURIComponent(this.props.subjectName) : undefined;

    if (subjectName) {
      api.refreshSchemaDetails(subjectName, force);
    }
  }

  render() {
    if (api.schemaOverviewIsConfigured === false) {
      return renderNotConfigured();
    }
    if (!api.schemaMode) {
      return DefaultSkeleton; // request in progress
    }

    if (!(api.schemaDetails || api.schemaCompatibility)) {
      return DefaultSkeleton;
    }

    const subjectName = this.props.subjectName ? decodeURIComponent(this.props.subjectName) : undefined;

    return (
      <PageContent key="b">
        <EditSchemaCompatibility
          onClose={() => {
            // Navigate back to the "caller" of the page, depending on what
            // variant of the editCompatibility page we are on(can be global, or subject)
            if (subjectName) {
              appGlobal.historyReplace(`/schema-registry/subjects/${encodeURIComponent(subjectName)}`);
            } else {
              appGlobal.historyReplace('/schema-registry');
            }
          }}
          subjectName={subjectName}
        />
      </PageContent>
    );
  }
}
export default EditSchemaCompatibilityPage;

function EditSchemaCompatibility(p: {
  subjectName?: string;
  onClose: () => void; // called after save/cancel
}) {
  const toast = useToast();
  const { subjectName } = p;
  const subject = subjectName ? api.schemaDetails.get(subjectName) : undefined;
  const schema = subject?.schemas.first((x) => x.version === subject.latestActiveVersion);

  // type should be just "SchemaRegistryCompatibilityMode"
  const [configMode, setConfigMode] = useState<string>(
    (subjectName ? subject?.compatibility : api.schemaCompatibility) ?? 'DEFAULT'
  );

  if (subjectName && !schema) {
    return DefaultSkeleton;
  }

  const onSave = () => {
    const changeReq = subjectName
      ? api.setSchemaRegistrySubjectCompatibilityMode(subjectName, configMode as SchemaRegistryCompatibilityMode)
      : api.setSchemaRegistryCompatibilityMode(configMode as SchemaRegistryCompatibilityMode);

    changeReq
      .then(async () => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: `Compatibility mode updated to ${configMode}`,
          position: 'top-right',
        });

        if (subjectName) {
          await api.refreshSchemaDetails(subjectName, true);
        } else {
          await api.refreshSchemaCompatibilityConfig();
        }

        p.onClose();
      })
      .catch((err) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to update compatibility mode',
          description: String(err),
          position: 'top-right',
        });
      });
  };

  return (
    <>
      <Text>
        Compatibility determines how schema validation occurs when producers are sending messages to Redpanda.
        {/* <Link>Learn more.</Link> */}
      </Text>

      <Grid gap="4rem" templateColumns="1fr 1fr">
        <GridItem mb="8" mt="4">
          <RadioGroup
            direction="column"
            isAttached={false}
            name="configMode"
            onChange={(e) => {
              setConfigMode(e);
            }}
            options={[
              {
                value: 'DEFAULT',
                disabled: !subject,
                label: (
                  <Box>
                    <Text>Default</Text>
                    <Text fontSize="small">Use the globally configured default.</Text>
                  </Box>
                ),
              },
              {
                value: 'NONE',
                label: (
                  <Box>
                    <Text>None</Text>
                    <Text fontSize="small">No schema compatibility checks are done.</Text>
                  </Box>
                ),
              },
              {
                value: 'BACKWARD',
                label: (
                  <Box>
                    <Text>Backward</Text>
                    <Text fontSize="small">
                      Consumers using the new schema (for example, version 10) can read data from producers using the
                      previous schema (for example, version 9).
                    </Text>
                  </Box>
                ),
              },
              {
                value: 'BACKWARD_TRANSITIVE',
                label: (
                  <Box>
                    <Text>Transitive Backward</Text>
                    <Text fontSize="small">
                      Consumers using the new schema (for example, version 10) can read data from producers using all
                      previous schemas (for example, versions 1-9).
                    </Text>
                  </Box>
                ),
              },
              {
                value: 'FORWARD',
                label: (
                  <Box>
                    <Text>Forward</Text>
                    <Text fontSize="small">
                      Consumers using the previous schema (for example, version 9) can read data from producers using
                      the new schema (for example, version 10).
                    </Text>
                  </Box>
                ),
              },
              {
                value: 'FORWARD_TRANSITIVE',
                label: (
                  <Box>
                    <Text>Transitive Forward</Text>
                    <Text fontSize="small">
                      Consumers using any previous schema (for example, versions 1-9) can read data from producers using
                      the new schema (for example, version 10).
                    </Text>
                  </Box>
                ),
              },
              {
                value: 'FULL',
                label: (
                  <Box>
                    <Text>Full</Text>
                    <Text fontSize="small">
                      A new schema and the previous schema (for example, versions 10 and 9) are both backward and
                      forward compatible with each other.
                    </Text>
                  </Box>
                ),
              },
              {
                value: 'FULL_TRANSITIVE',
                label: (
                  <Box>
                    <Text>Transitive Full</Text>
                    <Text fontSize="small">
                      Each schema is both backward and forward compatible with all registered schemas.
                    </Text>
                  </Box>
                ),
              },
            ]}
            value={configMode}
          />
        </GridItem>

        <GridItem>
          {subjectName && schema && (
            <>
              <Text fontSize="lg" fontWeight="bold" mt="4" whiteSpace="break-spaces" wordBreak="break-word">
                {subjectName}
              </Text>

              <Text fontSize="lg" fontWeight="bold" mb="4" mt="8">
                Schema
              </Text>
              <Box maxHeight="600px" overflow="scroll">
                <CodeBlock
                  codeString={getFormattedSchemaText(schema)}
                  language={schemaTypeToCodeBlockLanguage(schema.type)}
                  showCopyButton={false}
                  showLineNumbers
                  theme="light"
                />
              </Box>
            </>
          )}
        </GridItem>
      </Grid>

      <Flex gap="4">
        <Button
          colorScheme="brand"
          disabledReason={
            api.userData?.canManageSchemaRegistry === false
              ? "You don't have the 'canManageSchemaRegistry' permission"
              : undefined
          }
          onClick={onSave}
        >
          Save
        </Button>
        <Button onClick={p.onClose} variant="link">
          Cancel
        </Button>
      </Flex>
    </>
  );
}
