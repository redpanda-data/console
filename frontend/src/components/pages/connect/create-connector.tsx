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

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTable } from 'components/redpanda-ui/components/data-table';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { Input, InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Link } from 'components/redpanda-ui/components/typography';
import { CircleAlertIcon, FilterIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { docsLinks } from 'utils/docs-links';
import { showToast } from 'utils/toast.utils';

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
import Tabs from '../../misc/tabs/tabs';
import { Wizard, type WizardStep } from '../../misc/wizard';
import { PageComponent, type PageInitHelper } from '../page';

const ConnectorType = (p: {
  connectClusters: ClusterConnectors[];
  activeCluster: string | null;
  onActiveClusterChange: (clusterName: string | null) => void;
  selectedPlugin: ConnectorPlugin | null;
  onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
}) => {
  const tabFilterModes = ['all', 'export', 'import'] as const;
  const [textFilter, setTextFilter] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'export' | 'import'>('all');

  let filteredPlugins = [] as {
    class: string;
    type: 'sink' | 'source';
    version?: string | undefined;
  }[];

  if (p.activeCluster) {
    const allPlugins = api.connectAdditionalClusterInfo.get(p.activeCluster)?.plugins;

    filteredPlugins =
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 33, refactor later
      allPlugins?.filter((plugin) => {
        if (tabFilter === 'export' && plugin.type === 'source') {
          return false; // not an "export" type
        }

        if (tabFilter === 'import' && plugin.type === 'sink') {
          return false; // not an "import" type
        }

        const meta = findConnectorMetadata(plugin.class);
        if (!meta) {
          return true; // no metadata, show it always
        }

        if (textFilter) {
          let matchesFilter = false;

          if (meta.friendlyName && containsIgnoreCase(meta.friendlyName, textFilter)) {
            matchesFilter = true;
          }

          if (plugin.class && containsIgnoreCase(plugin.class, textFilter)) {
            matchesFilter = true;
          }

          if (meta.description && containsIgnoreCase(meta.description, textFilter)) {
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
      <div className="flex items-center justify-center rounded-lg bg-surface-subtle p-10">
        <div className="text-body-lg text-subtle">No connectors that match the search filters</div>
      </div>
    );

  return (
    <>
      {p.connectClusters.length > 1 && (
        <>
          <h2>Installation Target</h2>
          <div className="max-w-[400px]">
            <SingleSelect<string | undefined>
              onChange={p.onActiveClusterChange as (val: string | null | undefined) => void}
              options={p.connectClusters.map(({ clusterName }) => ({
                value: clusterName,
                label: clusterName,
              }))}
              value={p.activeCluster ?? undefined}
            />
          </div>
        </>
      )}

      {Boolean(p.activeCluster) && (
        <>
          <div className="flex flex-col gap-4">
            <div className="max-w-[600px]">
              <div className="text-body">
                Select a managed connector. Connectors simplify importing and exporting data between Redpanda and
                popular data sources. <Link href={docsLinks.cloud.managedConnectors}>Learn more</Link>
              </div>

              <div className="my-4 mt-8">
                <Input
                  onChange={(e) => setTextFilter(e.target.value)}
                  placeholder="Search"
                  testId="search-field-input"
                  value={textFilter}
                >
                  <InputStart>
                    <FilterIcon className="size-4 text-muted-foreground" data-testid="search-field-search-icon" />
                  </InputStart>
                  {textFilter !== '' && (
                    <InputEnd className="pointer-events-auto">
                      <Button
                        aria-label="Clear search"
                        data-testid="search-field-reset-icon"
                        onClick={() => setTextFilter('')}
                        size="icon-xs"
                        variant="ghost"
                      >
                        <XIcon />
                      </Button>
                    </InputEnd>
                  )}
                </Input>
              </div>
            </div>
          </div>

          {/* Filter-only tabs: the panels are empty and the card grid below reacts to the key. */}
          <Tabs
            onChange={(key) => {
              setTabFilter(key as (typeof tabFilterModes)[number]);
            }}
            tabs={[
              { key: 'all', title: 'All', content: null },
              { key: 'export', title: 'Export to', content: null },
              { key: 'import', title: 'Import from', content: null },
            ]}
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
};

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
    if (clusters === null || clusters === undefined) {
      return null;
    }
    const clusterName = decodeURIComponent(this.props.clusterName);

    return (
      <PageContent>
        <ConnectorWizard activeCluster={clusterName} connectClusters={clusters} />
      </PageContent>
    );
  }
}

type ConnectorWizardProps = {
  connectClusters: ClusterConnectors[];
  activeCluster: string;
};

const ConnectorWizard = ({ connectClusters, activeCluster }: ConnectorWizardProps) => {
  const [wizardState, setWizardState] = useState<{
    currentStep: number;
    selectedPlugin: ConnectorPlugin | null;
    invalidValidationResult: ConnectorValidationResult | null;
    validationFailure: unknown;
    creationFailure: unknown;
    genericFailure: Error | null;
  }>({
    currentStep: 0,
    selectedPlugin: null,
    invalidValidationResult: null,
    validationFailure: null,
    creationFailure: null,
    genericFailure: null,
  });
  const { currentStep, selectedPlugin, invalidValidationResult, validationFailure, creationFailure, genericFailure } =
    wizardState;
  const setCurrentStep = (v: number | ((n: number) => number)) =>
    setWizardState((prev) => ({ ...prev, currentStep: typeof v === 'function' ? v(prev.currentStep) : v }));
  const setSelectedPlugin = (v: ConnectorPlugin | null) => setWizardState((prev) => ({ ...prev, selectedPlugin: v }));
  const setInvalidValidationResult = (v: ConnectorValidationResult | null) =>
    setWizardState((prev) => ({ ...prev, invalidValidationResult: v }));
  const setValidationFailure = (v: unknown) => setWizardState((prev) => ({ ...prev, validationFailure: v }));
  const setCreationFailure = (v: unknown) => setWizardState((prev) => ({ ...prev, creationFailure: v }));
  const setGenericFailure = (v: Error | null) => setWizardState((prev) => ({ ...prev, genericFailure: v }));
  const [configState, setConfigState] = useState<{
    stringifiedConfig: string;
    parsedUpdatedConfig: Record<string, unknown> | null;
  }>({ stringifiedConfig: '', parsedUpdatedConfig: null });
  const { stringifiedConfig, parsedUpdatedConfig } = configState;
  const setStringifiedConfig = (v: string) => {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(v);
    } catch {
      // keep null
    }
    setConfigState({ stringifiedConfig: v, parsedUpdatedConfig: parsed });
  };
  const postCondition = parsedUpdatedConfig !== null;
  const [loadingState, setLoadingState] = useState({ loading: false, isStoreInitialized: false });
  const loading = loadingState.loading;
  const isStoreInitialized = loadingState.isStoreInitialized;
  const setLoading = (v: boolean) => setLoadingState((prev) => ({ ...prev, loading: v }));
  const setIsStoreInitialized = (v: boolean) => setLoadingState((prev) => ({ ...prev, isStoreInitialized: v }));
  const [connectClusterStore, setConnectClusterStore] = useState(() => ConnectClusterStore.getInstance(activeCluster));
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState(false);
  const openCreatingModal = () => setIsCreatingModalOpen(true);
  const closeCreatingModal = () => setIsCreatingModalOpen(false);

  useEffect(() => {
    const init = async () => {
      await connectClusterStore.setup();
      setIsStoreInitialized(true);
    };
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    init().catch(console.error);
  }, [connectClusterStore]);

  useEffect(() => {
    setConnectClusterStore(ConnectClusterStore.getInstance(activeCluster));
  }, [activeCluster]);

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
      postConditionMet: () => activeCluster !== null && selectedPlugin !== null,
      nextButtonLabel: null,
    },
    {
      title: 'Properties',
      description: 'Configure basic connection properties.',
      content: (
        <>
          <CreateConnectorHeading plugin={selectedPlugin} />

          {selectedPlugin ? (
            <div className="max-w-[800px]">
              <ConfigPage
                // biome-ignore lint/style/noNonNullAssertion: needed as refactoring child components would be very complex
                connectorStore={connectClusterStore.getConnector(selectedPlugin.class, null, undefined)!}
                context="CREATE"
              />
            </div>
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

        const configObj = connectorRef?.getConfigObject() as Record<string, unknown> | undefined;
        const isShallowEqual =
          parsedUpdatedConfig !== null &&
          configObj !== undefined &&
          Object.keys(parsedUpdatedConfig).length === Object.keys(configObj).length &&
          Object.keys(parsedUpdatedConfig).every((k) => parsedUpdatedConfig[k] === configObj[k]);
        if (parsedUpdatedConfig !== null && !isShallowEqual) {
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

        const pluginClass = selectedPlugin?.class ?? '';
        const parsedConfig = parsedUpdatedConfig ?? undefined;
        const connectorName = propertiesObject?.name as string;
        try {
          openCreatingModal();

          await connectClusterStore.createConnector(pluginClass, parsedConfig);

          // Wait a bit for the connector to appear, then navigate to it
          const maxScanTime = 10_000;
          const intervalSec = 100;
          const timer = new TimeSince();

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
          showToast({
            status: 'success',
            description: `Connector ${connectorName} created`,
          });
          closeCreatingModal();
        } catch (e: unknown) {
          closeCreatingModal();
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
        }
        setLoading(false);
        return { conditionMet: true };
      },
      nextButtonLabel: 'Create',
    },
  ];

  const isLast = () => currentStep === steps.length - 1;

  if (!isStoreInitialized) {
    return <SkeletonText className="mt-5" lines={20} width="full" />;
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

      {/* Not closeable while the connector is being created, so no onOpenChange handler. */}
      <Dialog open={isCreatingModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Creating connector...</DialogTitle>
          </DialogHeader>
          <DialogBody className="py-8">
            <div className="flex items-center justify-center">
              <Spinner className="size-10" />
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
};

function CreateConnectorHeading(p: { plugin: ConnectorPlugin | null }) {
  if (!p.plugin) {
    return <h1 className="text-heading-xl">Creating Connector</h1>;
  }

  const displayName = getConnectorFriendlyName(p.plugin.class);

  return (
    <h1 className="mb-8 flex items-center gap-[0.5ch] text-heading-lg">
      Create Connector:
      {p.plugin.type === 'source' ? 'import data from ' : 'export data to '}
      {displayName}
    </h1>
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
      {connectorPlugin !== null ? (
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
        <SkeletonText className="mt-5" lines={6} width="full" />
      ) : (
        <>
          {invalidValidationResult !== null ? <ValidationDisplay validationResult={invalidValidationResult} /> : null}

          {validationFailure ? (
            <Alert className="my-4" icon={<CircleAlertIcon />} variant="destructive">
              <AlertDescription>
                <div>
                  <h3 className="text-heading-xs">Validation attempt failed</h3>
                  <div>{String(validationFailure)}</div>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {creationFailure ? (
            <Alert className="my-4" icon={<CircleAlertIcon />} variant="destructive">
              <AlertDescription>
                <div>
                  <h3 className="text-heading-xs">Creation attempt failed</h3>
                  <div>{String(creationFailure)}</div>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          {genericFailure ? (
            <Alert className="my-4" icon={<CircleAlertIcon />} variant="destructive">
              <AlertDescription>
                <div>
                  <h3 className="text-heading-xs">An error occurred</h3>
                  <div>{String(genericFailure)}</div>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}

          <h2 className="mt-4 font-medium text-[1.4em]">Connector Properties</h2>
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
    <Alert className="my-4 overflow-auto" icon={<TriangleAlertIcon />} variant="warning">
      <AlertDescription>
        <div>
          <h3 className="mb-4 text-heading-xs">Submitted configuration is invalid</h3>
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
            pagination={false}
            sorting={false}
          />
        </div>
      </AlertDescription>
    </Alert>
  );
}

export default CreateConnector;
