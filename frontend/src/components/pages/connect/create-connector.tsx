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

import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  DataTable,
  Flex,
  Heading,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SearchField,
  Skeleton,
  Spinner,
  Tabs,
  Text,
  useDisclosure,
  useToast,
} from '@redpanda-data/ui';
import { comparer } from 'mobx';
import { observer, useLocalObservable } from 'mobx-react';
import { useEffect, useState } from 'react';

import { ConnectorBoxCard, type ConnectorPlugin, getConnectorFriendlyName } from './connector-box-card';
import { ConfigPage } from './dynamic-ui/components';
import { findConnectorMetadata } from './helper';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import { ConnectClusterStore, ConnectorValidationError } from '../../../state/connect/state';
import { type ClusterConnectors, type ConnectorValidationResult, DataType } from '../../../state/rest-interfaces';
import { uiState } from '../../../state/ui-state';
import { containsIgnoreCase, delay, TimeSince } from '../../../utils/utils';
import { HiddenRadioList } from '../../misc/hidden-radio-list';
import KowlEditor from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SingleSelect } from '../../misc/select';
import { Wizard, type WizardStep } from '../../misc/wizard';
import { PageComponent, type PageInitHelper } from '../page';

const ConnectorType = observer(
  (p: {
    connectClusters: ClusterConnectors[];
    activeCluster: string | null;
    onActiveClusterChange: (clusterName: string | null) => void;
    selectedPlugin: ConnectorPlugin | null;
    onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
  }) => {
    const tabFilterModes = ['all', 'export', 'import'] as const;
    const state = useLocalObservable(() => ({
      textFilter: '',
      tabFilter: 'all' as 'all' | 'export' | 'import',
    }));

    let filteredPlugins = [] as {
      class: string;
      type: 'sink' | 'source';
      version?: string | undefined;
    }[];

    if (p.activeCluster) {
      const allPlugins = api.connectAdditionalClusterInfo.get(p.activeCluster)?.plugins;

      filteredPlugins =
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 33, refactor later
        allPlugins?.filter((p) => {
          if (state.tabFilter === 'export' && p.type === 'source') {
            return false; // not an "export" type
          }

          if (state.tabFilter === 'import' && p.type === 'sink') {
            return false; // not an "import" type
          }

          const meta = findConnectorMetadata(p.class);
          if (!meta) {
            return true; // no metadata, show it always
          }

          if (state.textFilter) {
            let matchesFilter = false;

            if (meta.friendlyName && containsIgnoreCase(meta.friendlyName, state.textFilter)) {
              matchesFilter = true;
            }

            if (p.class && containsIgnoreCase(p.class, state.textFilter)) {
              matchesFilter = true;
            }

            if (meta.description && containsIgnoreCase(meta.description, state.textFilter)) {
              matchesFilter = true;
            }

            if (!matchesFilter) {
              return false; // doesn't match the text filter
            }
          }

          // no filters active that would remove the entry from the list
          return true;
        }) || [];
    }

    const noResultsBox =
      filteredPlugins?.length > 0 ? null : (
        <Flex alignItems="center" background="blackAlpha.100" borderRadius="8px" justifyContent="center" p="10">
          <Text color="gray" fontSize="large">
            No connectors that match the search filters
          </Text>
        </Flex>
      );

    return (
      <>
        {p.connectClusters.length > 1 && (
          <>
            <h2>Installation Target</h2>
            <Box maxWidth={400}>
              <SingleSelect<string | undefined>
                onChange={p.onActiveClusterChange as (val: string | null | undefined) => void}
                options={p.connectClusters.map(({ clusterName }) => ({
                  value: clusterName,
                  label: clusterName,
                }))}
                value={p.activeCluster ?? undefined}
              />
            </Box>
          </>
        )}

        {p.activeCluster && (
          <>
            <Flex direction="column" gap="1em">
              <Box maxWidth="600px">
                <Text>
                  Select a managed connector. Connectors simplify importing and exporting data between Redpanda and
                  popular data sources.{' '}
                  <Link href="https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/">
                    Learn more
                  </Link>
                </Text>

                <Box marginBlock="4" marginTop="8">
                  <SearchField
                    icon="filter"
                    placeholderText="Search"
                    searchText={state.textFilter}
                    setSearchText={(x) => (state.textFilter = x)}
                  />
                </Box>
              </Box>
            </Flex>

            <Tabs
              items={[
                {
                  key: 'all',
                  name: 'All',
                  component: <></>,
                },
                {
                  key: 'export',
                  name: 'Export to',
                  component: <></>,
                },
                {
                  key: 'import',
                  name: 'Import from',
                  component: <></>,
                },
              ]}
              marginBlock="2"
              onChange={(_, key) => {
                state.tabFilter = key as (typeof tabFilterModes)[number];
              }}
            />

            <HiddenRadioList<ConnectorPlugin>
              name={'connector-type'}
              onChange={p.onPluginSelectionChange}
              options={filteredPlugins.map((plugin) => ({
                value: plugin,
                render: (card) => <ConnectorBoxCard {...card} connectorPlugin={plugin} />,
              }))}
              value={p.selectedPlugin ?? undefined}
            />

            {noResultsBox}
          </>
        )}
      </>
    );
  }
);

@observer
class CreateConnector extends PageComponent<{ clusterName: string }> {
  initPage(p: PageInitHelper) {
    const clusterName = decodeURIComponent(this.props.clusterName);
    p.title = 'Create Connector';
    p.addBreadcrumb('Connectors', '/connect-clusters');
    p.addBreadcrumb(clusterName, `/connect-clusters/${encodeURIComponent(clusterName)}`);
    p.addBreadcrumb('Create Connector', `/connect-clusters/${encodeURIComponent(clusterName)}/create-connector`);

    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  refreshData() {
    api.refreshConnectClusters().catch(() => {
      // Error handling managed by API layer
    });
  }

  render() {
    const clusters = api.connectConnectors?.clusters;
    if (clusters == null) {
      return null;
    }
    const clusterName = decodeURIComponent(this.props.clusterName);

    return (
      <PageContent>
        <ConnectorWizard activeCluster={clusterName} connectClusters={clusters} />
        {/*
                <Section>
                    <div className={styles.wizardView}>

                    </div>
                </Section> */}
      </PageContent>
    );
  }
}

type ConnectorWizardProps = {
  connectClusters: ClusterConnectors[];
  activeCluster: string;
};

const ConnectorWizard = observer(({ connectClusters, activeCluster }: ConnectorWizardProps) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedPlugin, setSelectedPlugin] = useState<ConnectorPlugin | null>(null);
  const [invalidValidationResult, setInvalidValidationResult] = useState<ConnectorValidationResult | null>(null);
  const [validationFailure, setValidationFailure] = useState<unknown>(null);
  const [creationFailure, setCreationFailure] = useState<unknown>(null);
  const [genericFailure, setGenericFailure] = useState<Error | null>(null);
  const [stringifiedConfig, setStringifiedConfig] = useState<string>('');
  const [parsedUpdatedConfig, setParsedUpdatedConfig] = useState<Record<string, unknown> | null>(null);
  const [postCondition, setPostCondition] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [connectClusterStore, setConnectClusterStore] = useState(ConnectClusterStore.getInstance(activeCluster));
  const { isOpen: isCreatingModalOpen, onOpen: openCreatingModal, onClose: closeCreatingModal } = useDisclosure();

  useEffect(() => {
    const init = async () => {
      await connectClusterStore.setup();
    };
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    init().catch(console.error);
  }, [connectClusterStore]);

  useEffect(() => {
    setConnectClusterStore(ConnectClusterStore.getInstance(activeCluster));
  }, [activeCluster]);

  useEffect(() => {
    try {
      setParsedUpdatedConfig(JSON.parse(stringifiedConfig));
    } catch (_e) {
      setParsedUpdatedConfig(null);
      setPostCondition(false);
    }
    setPostCondition(true);
  }, [stringifiedConfig]);

  const clearErrors = () => {
    setCreationFailure(null);
    setValidationFailure(null);
    setInvalidValidationResult(null);
    setGenericFailure(null);
  };

  const steps: WizardStep[] = [
    {
      title: 'Connector Type',
      description: 'Choose type of connector.',
      content: (
        <ConnectorType
          activeCluster={activeCluster}
          connectClusters={connectClusters}
          onActiveClusterChange={(clusterName) => {
            uiState.pageBreadcrumbs = [
              { title: 'Connectors', linkTo: '/connect-clusters' },
              // biome-ignore lint/style/noNonNullAssertion: we know clusterName is defined
              { title: clusterName!, linkTo: `/connect-clusters/${encodeURIComponent(clusterName!)}` },
              {
                title: 'Create Connector',
                // biome-ignore lint/style/noNonNullAssertion: we know clusterName is defined
                linkTo: `/connect-clusters/${encodeURIComponent(clusterName!)}/create-connector`,
              },
            ];
            // biome-ignore lint/style/noNonNullAssertion: we know clusterName is defined
            appGlobal.historyPush(`/connect-clusters/${encodeURIComponent(clusterName!)}/create-connector`);
          }}
          onPluginSelectionChange={(e) => {
            setSelectedPlugin(e);
            setCurrentStep(1);
          }}
          selectedPlugin={selectedPlugin}
        />
      ),
      postConditionMet: () => activeCluster != null && selectedPlugin != null,
      nextButtonLabel: null,
    },
    {
      title: 'Properties',
      description: 'Configure basic connection properties.',
      content: (
        <>
          <CreateConnectorHeading plugin={selectedPlugin} />

          {selectedPlugin ? (
            <Box maxWidth="800px">
              <ConfigPage
                // biome-ignore lint/style/noNonNullAssertion: needed as refactoring child components would be very complex
                connectorStore={connectClusterStore.getConnector(selectedPlugin.class, null, undefined)!}
                context="CREATE"
              />
            </Box>
          ) : (
            <div>no cluster or plugin selected</div>
          )}
        </>
      ),
      transitionConditionMet: () => {
        if (selectedPlugin) {
          connectClusterStore.getConnector(selectedPlugin.class, null, undefined)?.getConfigObject();
          setStringifiedConfig(connectClusterStore.getConnector(selectedPlugin.class, null, undefined)?.jsonText ?? '');
          return Promise.resolve({ conditionMet: true });
        }
        return Promise.resolve({ conditionMet: false });
      },
      postConditionMet: () => true,
    },
    {
      title: 'Review',
      description: 'Review and optionally patch the created connector config.',
      content: selectedPlugin && (
        <Review
          connectorPlugin={selectedPlugin}
          creationFailure={creationFailure}
          genericFailure={genericFailure}
          invalidValidationResult={invalidValidationResult}
          isCreating={loading}
          onChange={(editorContent) => {
            setStringifiedConfig(editorContent ?? '');
          }}
          properties={stringifiedConfig}
          validationFailure={validationFailure}
        />
      ),
      postConditionMet: () => postCondition && !loading,
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 40, refactor later
      async transitionConditionMet(): Promise<{ conditionMet: boolean }> {
        clearErrors();
        setLoading(true);
        const connectorRef = connectClusterStore.getConnector(selectedPlugin?.class ?? '', null, undefined);

        if (parsedUpdatedConfig != null && !comparer.shallow(parsedUpdatedConfig, connectorRef?.getConfigObject())) {
          connectorRef?.updateProperties(parsedUpdatedConfig);
        }

        const secrets = connectorRef?.secrets;
        if (secrets) {
          for (const p of connectorRef.propsByName.values()) {
            if (p.entry.definition.type === DataType.Password) {
              const secret = secrets.getSecret(p.name);
              // secret.extractSecretId(property.value);
              secret.extractSecretId(p.value as string);

              // In case the secret has not been populated (because the user only used the JSON view to modify the connector),
              // we need to copy the values from the json into the secrets
              const valueFromJson = parsedUpdatedConfig?.[p.name];
              if (!secret.value && Boolean(valueFromJson)) {
                secret.value = String(valueFromJson);
              }
            }
          }
        }

        const propertiesObject: Record<string, unknown> | undefined = connectorRef?.getConfigObject() as
          | Record<string, unknown>
          | undefined;
        try {
          const validationResult = await api.validateConnectorConfig(
            activeCluster,
            selectedPlugin?.class ?? '',
            propertiesObject ?? {}
          );

          const errorCount = validationResult.configs.sum((x) => x.value.errors.length);

          if (errorCount > 0) {
            setInvalidValidationResult(validationResult);
            setLoading(false);
            return { conditionMet: false };
          }
        } catch (e) {
          throw new ConnectorValidationError(String(e));
        }

        try {
          openCreatingModal();

          await connectClusterStore.createConnector(selectedPlugin?.class ?? '', parsedUpdatedConfig ?? undefined);

          // Wait a bit for the connector to appear, then navigate to it
          const maxScanTime = 10_000;
          const intervalSec = 100;
          const timer = new TimeSince();

          const connectorName = connectorRef?.propsByName.get('name')?.value as string;

          while (true) {
            const elapsedTime = timer.value;
            // biome-ignore lint/suspicious/noConsole: intentional console usage
            console.log('scanning for new connector...', { connectorName, elapsedTime });
            if (elapsedTime > maxScanTime) {
              // Abort, tried to wait for too long
              appGlobal.historyPush(`/connect-clusters/${encodeURIComponent(activeCluster)}`);
              break;
            }

            await connectClusterStore.refreshData(true);
            const connector = connectClusterStore.getConnectorState(connectorName);

            if (connector) {
              // Success
              appGlobal.historyPush(
                `/connect-clusters/${encodeURIComponent(activeCluster)}/${encodeURIComponent(connectorName)}`
              );
              break;
            }

            await delay(intervalSec);
          }
          toast({
            status: 'success',
            description: `Connector ${connectorName} created`,
          });
        } catch (e: unknown) {
          const error = e as { name?: string; message?: string };
          switch (error?.name) {
            case 'ConnectorValidationError':
              setValidationFailure(error?.message);
              break;
            case 'ConnectorCreationError':
              setCreationFailure(error?.message);
              break;
            default:
              setGenericFailure(new Error(error?.message));
          }
          setLoading(false);
          return { conditionMet: false };
        } finally {
          closeCreatingModal();
        }
        setLoading(false);
        return { conditionMet: true };
      },
      nextButtonLabel: 'Create',
    },
  ];

  const isLast = () => currentStep === steps.length - 1;

  if (!connectClusterStore.isInitialized) {
    return <Skeleton height={4} mt={5} noOfLines={20} />;
  }

  return (
    <>
      <Wizard
        state={{
          canContinue: () => steps[currentStep].postConditionMet(),
          next: async () => {
            const transitionConditionMet = steps[currentStep].transitionConditionMet;
            if (transitionConditionMet) {
              const { conditionMet } = await transitionConditionMet();
              if (!conditionMet) {
                return;
              }
            }

            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 10);

            return currentStep < steps.length - 1 ? setCurrentStep((n) => n + 1) : undefined;
          },
          previous: () => {
            if (currentStep === 1) {
              setSelectedPlugin(null);
            }
            clearErrors();

            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 10);

            return currentStep > 0 ? setCurrentStep((n) => n - 1) : undefined;
          },
          isLast,
          isFirst: () => currentStep === 0,
          getCurrentStep: () => [currentStep, steps[currentStep]],
          getSteps: () => steps,
        }}
      />

      <Modal
        isCentered
        isOpen={isCreatingModalOpen}
        onClose={() => {
          // no op - modal is not closeable during connector creation
        }}
      >
        <ModalOverlay backdropFilter="blur(5px)" bg="blackAlpha.300" />
        <ModalContent>
          <ModalHeader>Creating connector...</ModalHeader>
          <ModalBody py="8">
            <Flex alignItems="center" justifyContent="center">
              <Spinner size="xl" />
            </Flex>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
});

function CreateConnectorHeading(p: { plugin: ConnectorPlugin | null }) {
  if (!p.plugin) {
    return <Heading>Creating Connector</Heading>;
  }

  // const { logo } = findConnectorMetadata(p.plugin.class) ?? {};
  const displayName = getConnectorFriendlyName(p.plugin.class);

  return (
    <Heading alignItems="center" as="h1" display="flex" fontSize="2xl" gap=".5ch" mb="8">
      Create Connector:
      {p.plugin.type === 'source' ? 'import data from ' : 'export data to '}
      {displayName}
      {/* <Box width="28px" height="28px" mr="1">{logo}</Box> */}
    </Heading>
  );
}

type ReviewProps = {
  connectorPlugin: ConnectorPlugin | null;
  onChange: (editorContent: string | undefined) => void;
  properties?: string;
  invalidValidationResult: ConnectorValidationResult | null;
  validationFailure: unknown;
  creationFailure: unknown;
  genericFailure: Error | null;
  isCreating: boolean;
};

function Review({
  connectorPlugin,
  properties,
  invalidValidationResult,
  validationFailure,
  creationFailure,
  genericFailure,
  onChange,
  isCreating,
}: ReviewProps) {
  return (
    <>
      {connectorPlugin != null ? (
        <>
          <h2>Connector Plugin</h2>
          <ConnectorBoxCard
            borderStyle="dashed"
            borderWidth="medium"
            connectorPlugin={connectorPlugin}
            hoverable={false}
          />
        </>
      ) : null}

      {isCreating ? (
        <Skeleton height={4} mt={5} noOfLines={6} />
      ) : (
        <>
          {invalidValidationResult != null ? <ValidationDisplay validationResult={invalidValidationResult} /> : null}

          {validationFailure ? (
            <Alert my={4} status="error" variant="left-accent">
              <AlertIcon />
              <AlertDescription>
                <Box>
                  <Text as="h3">Validation attempt failed</Text>
                  <Text>{String(validationFailure)}</Text>
                </Box>
              </AlertDescription>
            </Alert>
          ) : null}

          {creationFailure ? (
            <Alert my={4} status="error" variant="left-accent">
              <AlertIcon />
              <AlertDescription>
                <Box>
                  <Text as="h3">Creation attempt failed</Text>
                  <Text>{String(creationFailure)}</Text>
                </Box>
              </AlertDescription>
            </Alert>
          ) : null}

          {genericFailure ? (
            <Alert my={4} status="error" variant="left-accent">
              <AlertIcon />
              <AlertDescription>
                <Box>
                  <Text as="h3">An error occurred</Text>
                  <Text>{String(genericFailure)}</Text>
                </Box>
              </AlertDescription>
            </Alert>
          ) : null}

          <Heading as="h2" fontSize="1.4em" fontWeight="500" mt="4">
            Connector Properties
          </Heading>
          <div style={{ margin: '0 auto 1.5rem' }}>
            <KowlEditor
              height="600px"
              language="json"
              onChange={onChange}
              options={{ readOnly: isCreating }}
              value={properties}
            />
          </div>
        </>
      )}
    </>
  );
}

function getDataSource(validationResult: ConnectorValidationResult) {
  return validationResult.configs
    .filter((connectorProperty) => connectorProperty.value.errors.length > 0)
    .map((cp) => cp.value);
}

function ValidationDisplay({ validationResult }: { validationResult: ConnectorValidationResult }) {
  return (
    <Alert my={4} overflow="auto" status="warning" variant="left-accent">
      <AlertDescription>
        <Box>
          <Text as="h3" mb={4}>
            Submitted configuration is invalid
          </Text>
          <DataTable<{
            name: string;
            value: string | null;
            recommended_values: string[];
            errors: string[];
            visible: boolean;
          }>
            columns={[
              {
                header: 'Property Name',
                accessorKey: 'name',
              },
              {
                header: 'Current Value',
                accessorKey: 'value',
              },
              {
                header: 'Validation Errors',
                accessorKey: 'errors',
              },
            ]}
            data={getDataSource(validationResult)}
          />
        </Box>
      </AlertDescription>
    </Alert>
  );
}

export default CreateConnector;
