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

import { AlertIcon, FilterIcon, WarningIcon } from 'components/icons';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { DataTable } from 'components/redpanda-ui/components/data-table';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from 'components/redpanda-ui/components/dialog';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Link } from 'components/redpanda-ui/components/typography';
import { useEffect, useState } from 'react';
import { docsLinks } from 'utils/docs-links';
import { showToast } from 'utils/toast.utils';

import { ConnectorBoxCard, type ConnectorPlugin, getConnectorFriendlyName } from './connector-box-card';
import { ConfigPage } from './dynamic-ui/components';
import { type ConnectorMetadata, findConnectorMetadata } from './helper';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import {
  ConnectClusterStore,
  type ConnectorPropertiesStore,
  ConnectorValidationError,
} from '../../../state/connect/state';
import { type ClusterConnectors, type ConnectorValidationResult, DataType } from '../../../state/rest-interfaces';
import { uiState } from '../../../state/ui-state';
import { containsIgnoreCase, delay, TimeSince } from '../../../utils/utils';
import { HiddenRadioList } from '../../misc/hidden-radio-list';
import KowlEditor from '../../misc/kowl-editor';
import PageContent from '../../misc/page-content';
import { SearchInput } from '../../misc/search-input';
import { SingleSelect } from '../../misc/select';
import Tabs from '../../misc/tabs/tabs';
import { Wizard, type WizardStep } from '../../misc/wizard';
import { PageComponent, type PageInitHelper } from '../page';

type PluginTabFilter = 'all' | 'export' | 'import';
type ConnectorPluginEntry = { class: string; type: 'sink' | 'source'; version?: string | undefined };

function matchesTabFilter(plugin: ConnectorPluginEntry, tabFilter: PluginTabFilter): boolean {
  if (tabFilter === 'export') {
    return plugin.type !== 'source'; // not an "export" type
  }
  if (tabFilter === 'import') {
    return plugin.type !== 'sink'; // not an "import" type
  }
  return true;
}

function matchesTextFilter(plugin: ConnectorPluginEntry, meta: ConnectorMetadata, textFilter: string): boolean {
  if (!textFilter) {
    return true;
  }
  return Boolean(
    (meta.friendlyName && containsIgnoreCase(meta.friendlyName, textFilter)) ||
      (plugin.class && containsIgnoreCase(plugin.class, textFilter)) ||
      (meta.description && containsIgnoreCase(meta.description, textFilter))
  );
}

function matchesPluginFilters(plugin: ConnectorPluginEntry, tabFilter: PluginTabFilter, textFilter: string): boolean {
  if (!matchesTabFilter(plugin, tabFilter)) {
    return false;
  }

  const meta = findConnectorMetadata(plugin.class);
  if (!meta) {
    return true; // no metadata, show it always
  }

  return matchesTextFilter(plugin, meta, textFilter);
}

const ConnectorType = (p: {
  connectClusters: ClusterConnectors[];
  activeCluster: string | null;
  onActiveClusterChange: (clusterName: string | null) => void;
  selectedPlugin: ConnectorPlugin | null;
  onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
}) => {
  const tabFilterModes = ['all', 'export', 'import'] as const;
  const [textFilter, setTextFilter] = useState('');
  const [tabFilter, setTabFilter] = useState<PluginTabFilter>('all');

  let filteredPlugins = [] as ConnectorPluginEntry[];

  if (p.activeCluster) {
    const allPlugins = api.connectAdditionalClusterInfo.get(p.activeCluster)?.plugins;

    filteredPlugins = allPlugins?.filter((plugin) => matchesPluginFilters(plugin, tabFilter, textFilter)) || [];
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
                <SearchInput
                  icon={<FilterIcon className="size-4" />}
                  onChange={setTextFilter}
                  placeholder="Search"
                  value={textFilter}
                />
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

type ConfigObject = Record<string, unknown>;

type ConnectorWizardState = {
  currentStep: number;
  selectedPlugin: ConnectorPlugin | null;
  invalidValidationResult: ConnectorValidationResult | null;
  validationFailure: unknown;
  creationFailure: unknown;
  genericFailure: Error | null;
  loading: boolean;
};

function useConnectorWizardState() {
  const [wizardState, setWizardState] = useState<ConnectorWizardState>({
    currentStep: 0,
    selectedPlugin: null,
    invalidValidationResult: null,
    validationFailure: null,
    creationFailure: null,
    genericFailure: null,
    loading: false,
  });
  const patch = (next: Partial<ConnectorWizardState>) => setWizardState((prev) => ({ ...prev, ...next }));

  return {
    ...wizardState,
    setCurrentStep: (v: number | ((n: number) => number)) =>
      setWizardState((prev) => ({ ...prev, currentStep: typeof v === 'function' ? v(prev.currentStep) : v })),
    setSelectedPlugin: (v: ConnectorPlugin | null) => patch({ selectedPlugin: v }),
    setInvalidValidationResult: (v: ConnectorValidationResult | null) => patch({ invalidValidationResult: v }),
    setValidationFailure: (v: unknown) => patch({ validationFailure: v }),
    setCreationFailure: (v: unknown) => patch({ creationFailure: v }),
    setGenericFailure: (v: Error | null) => patch({ genericFailure: v }),
    setLoading: (v: boolean) => patch({ loading: v }),
    clearErrors: () =>
      patch({ creationFailure: null, validationFailure: null, invalidValidationResult: null, genericFailure: null }),
  };
}

type WizardControls = ReturnType<typeof useConnectorWizardState>;

function parseConfigText(text: string): ConfigObject | null {
  try {
    return JSON.parse(text);
  } catch {
    return null; // keep null
  }
}

function useConnectorConfigText() {
  const [configState, setConfigState] = useState<{
    stringifiedConfig: string;
    parsedUpdatedConfig: ConfigObject | null;
  }>({ stringifiedConfig: '', parsedUpdatedConfig: null });
  const setStringifiedConfig = (v: string) =>
    setConfigState({ stringifiedConfig: v, parsedUpdatedConfig: parseConfigText(v) });

  return { ...configState, setStringifiedConfig };
}

function useInitializedConnectClusterStore(activeCluster: string) {
  const [connectClusterStore, setConnectClusterStore] = useState(() => ConnectClusterStore.getInstance(activeCluster));
  const [isStoreInitialized, setIsStoreInitialized] = useState(false);

  useEffect(() => {
    // A store swapped in for another cluster must not be marked ready by the previous store's setup.
    let cancelled = false;
    const init = async () => {
      await connectClusterStore.setup();
      if (!cancelled) {
        setIsStoreInitialized(true);
      }
    };
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    init().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [connectClusterStore]);

  useEffect(() => {
    setConnectClusterStore(ConnectClusterStore.getInstance(activeCluster));
  }, [activeCluster]);

  return { connectClusterStore, isStoreInitialized };
}

function isShallowEqualConfig(a: ConfigObject, b: ConfigObject): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
}

// The review step's JSON editor may have changed the config; push those edits back into the form store.
function applyEditedConfig(
  connectorRef: ConnectorPropertiesStore | undefined,
  parsedUpdatedConfig: ConfigObject | null
) {
  const configObj = connectorRef?.getConfigObject() as ConfigObject | undefined;
  const isShallowEqual =
    parsedUpdatedConfig !== null && configObj !== undefined && isShallowEqualConfig(parsedUpdatedConfig, configObj);
  if (parsedUpdatedConfig !== null && !isShallowEqual) {
    connectorRef?.updateProperties(parsedUpdatedConfig);
  }
}

function syncSecretsFromJson(
  connectorRef: ConnectorPropertiesStore | undefined,
  parsedUpdatedConfig: ConfigObject | null
) {
  const secrets = connectorRef?.secrets;
  if (!secrets) {
    return;
  }

  for (const p of connectorRef.propsByName.values()) {
    if (p.entry.definition.type === DataType.Password) {
      const secret = secrets.getSecret(p.name);
      // secret.extractSecretId(property.value);
      secret.extractSecretId(p.value as string);

      // In case the secret has not been populated (because the user only used the JSON view to modify the connector),
      // we need to copy the values from the json into the secrets
      const valueFromJson = parsedUpdatedConfig?.[p.name];
      if (!secret.value && valueFromJson) {
        secret.value = String(valueFromJson);
      }
    }
  }
}

function prepareConnectorConfig(
  connectClusterStore: ConnectClusterStore,
  pluginClass: string,
  parsedUpdatedConfig: ConfigObject | null
): ConfigObject | undefined {
  const connectorRef = connectClusterStore.getConnector(pluginClass, null, undefined);
  applyEditedConfig(connectorRef, parsedUpdatedConfig);
  syncSecretsFromJson(connectorRef, parsedUpdatedConfig);
  return connectorRef?.getConfigObject() as ConfigObject | undefined;
}

// The validation result when the config has errors to show, otherwise null.
async function findValidationErrors(
  activeCluster: string,
  pluginClass: string,
  propertiesObject: ConfigObject | undefined
): Promise<ConnectorValidationResult | null> {
  try {
    const validationResult = await api.validateConnectorConfig(activeCluster, pluginClass, propertiesObject ?? {});
    const errorCount = validationResult.configs.sum((x) => x.value.errors.length);
    return errorCount > 0 ? validationResult : null;
  } catch (e) {
    throw new ConnectorValidationError(String(e));
  }
}

const CONNECTOR_SCAN_MAX_TIME = 10_000;
const CONNECTOR_SCAN_INTERVAL = 100;

// Polls until the new connector appears; false when it did not show up in time. Each poll waits for
// the previous refresh to land, so the scans recurse one after another rather than overlap.
async function waitForConnector(
  connectClusterStore: ConnectClusterStore,
  connectorName: string,
  timer = new TimeSince()
): Promise<boolean> {
  if (timer.value > CONNECTOR_SCAN_MAX_TIME) {
    return false; // Abort, tried to wait for too long
  }

  await connectClusterStore.refreshData(true);
  if (connectClusterStore.getConnectorState(connectorName)) {
    return true;
  }

  await delay(CONNECTOR_SCAN_INTERVAL);
  return waitForConnector(connectClusterStore, connectorName, timer);
}

type ReviewSubmission = {
  activeCluster: string;
  connectClusterStore: ConnectClusterStore;
  pluginClass: string;
  parsedUpdatedConfig: ConfigObject | null;
  wizard: WizardControls;
  setCreatingModalOpen: (open: boolean) => void;
};

// Creates the connector, then waits a bit for it to appear and navigates to it.
async function createAndOpenConnector(submission: ReviewSubmission, connectorName: string) {
  const { activeCluster, connectClusterStore } = submission;
  await connectClusterStore.createConnector(submission.pluginClass, submission.parsedUpdatedConfig ?? undefined);

  const clusterPath = `/connect-clusters/${encodeURIComponent(activeCluster)}`;
  const appeared = await waitForConnector(connectClusterStore, connectorName);
  appGlobal.historyPush(appeared ? `${clusterPath}/${encodeURIComponent(connectorName)}` : clusterPath);

  showToast({
    status: 'success',
    description: `Connector ${connectorName} created`,
  });
}

function reportCreationFailure(e: unknown, wizard: WizardControls) {
  const error = e as { name?: string; message?: string };
  switch (error?.name) {
    case 'ConnectorValidationError':
      wizard.setValidationFailure(error?.message);
      break;
    case 'ConnectorCreationError':
      wizard.setCreationFailure(error?.message);
      break;
    default:
      wizard.setGenericFailure(new Error(error?.message));
  }
}

async function createConnectorWithProgress(submission: ReviewSubmission, connectorName: string): Promise<boolean> {
  try {
    submission.setCreatingModalOpen(true);
    await createAndOpenConnector(submission, connectorName);
    submission.setCreatingModalOpen(false);
    return true;
  } catch (e: unknown) {
    submission.setCreatingModalOpen(false);
    reportCreationFailure(e, submission.wizard);
    return false;
  }
}

async function validateAndCreateConnector(submission: ReviewSubmission): Promise<boolean> {
  const { activeCluster, connectClusterStore, pluginClass } = submission;
  const propertiesObject = prepareConnectorConfig(connectClusterStore, pluginClass, submission.parsedUpdatedConfig);

  const invalidResult = await findValidationErrors(activeCluster, pluginClass, propertiesObject);
  if (invalidResult) {
    submission.wizard.setInvalidValidationResult(invalidResult);
    return false;
  }

  return await createConnectorWithProgress(submission, propertiesObject?.name as string);
}

async function submitReview(submission: ReviewSubmission): Promise<{ conditionMet: boolean }> {
  submission.wizard.clearErrors();
  submission.wizard.setLoading(true);
  const conditionMet = await validateAndCreateConnector(submission);
  submission.wizard.setLoading(false);
  return { conditionMet };
}

const ConnectorWizard = ({ connectClusters, activeCluster }: ConnectorWizardProps) => {
  const wizard = useConnectorWizardState();
  const { currentStep, selectedPlugin, invalidValidationResult, validationFailure, creationFailure, genericFailure } =
    wizard;
  const { stringifiedConfig, parsedUpdatedConfig, setStringifiedConfig } = useConnectorConfigText();
  const { connectClusterStore, isStoreInitialized } = useInitializedConnectClusterStore(activeCluster);
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState(false);

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
            wizard.setSelectedPlugin(e);
            wizard.setCurrentStep(1);
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
          isCreating={wizard.loading}
          onChange={(editorContent) => {
            setStringifiedConfig(editorContent ?? '');
          }}
          properties={stringifiedConfig}
          validationFailure={validationFailure}
        />
      ),
      postConditionMet: () => parsedUpdatedConfig !== null && !wizard.loading,
      transitionConditionMet: () =>
        submitReview({
          activeCluster,
          connectClusterStore,
          pluginClass: selectedPlugin?.class ?? '',
          parsedUpdatedConfig,
          wizard,
          setCreatingModalOpen: setIsCreatingModalOpen,
        }),
      nextButtonLabel: 'Create',
    },
  ];

  if (!isStoreInitialized) {
    return (
      <div className="mt-5">
        <SkeletonText lines={20} width="full" />
      </div>
    );
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

            return currentStep < steps.length - 1 ? wizard.setCurrentStep((n) => n + 1) : undefined;
          },
          previous: () => {
            if (currentStep === 1) {
              wizard.setSelectedPlugin(null);
            }
            wizard.clearErrors();

            setTimeout(() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 10);

            return currentStep > 0 ? wizard.setCurrentStep((n) => n - 1) : undefined;
          },
          isFirst: () => currentStep === 0,
          getCurrentStep: () => [currentStep, steps[currentStep]],
        }}
      />

      {/* Not closeable while the connector is being created: no onOpenChange handler, and the
          close X has to be suppressed or it would render and do nothing. */}
      <Dialog open={isCreatingModalOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Creating connector...</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-center justify-center py-8">
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
    <h1 className="flex items-center gap-[0.5ch] pb-8 text-heading-xl">
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
      {connectorPlugin === null ? null : (
        <>
          <h2>Connector Plugin</h2>
          <ConnectorBoxCard
            borderStyle="dashed"
            borderWidth="medium"
            connectorPlugin={connectorPlugin}
            hoverable={false}
          />
        </>
      )}

      {isCreating ? (
        <div className="mt-5">
          <SkeletonText lines={6} width="full" />
        </div>
      ) : (
        <>
          {invalidValidationResult === null ? null : (
            <div className="my-4">
              <ValidationDisplay validationResult={invalidValidationResult} />
            </div>
          )}

          {validationFailure ? (
            <div className="my-4">
              <Alert icon={<AlertIcon />} variant="destructive">
                <AlertTitle>Validation attempt failed</AlertTitle>
                <AlertDescription>{String(validationFailure)}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {creationFailure ? (
            <div className="my-4">
              <Alert icon={<AlertIcon />} variant="destructive">
                <AlertTitle>Creation attempt failed</AlertTitle>
                <AlertDescription>{String(creationFailure)}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {genericFailure ? (
            <div className="my-4">
              <Alert icon={<AlertIcon />} variant="destructive">
                <AlertTitle>An error occurred</AlertTitle>
                <AlertDescription>{String(genericFailure)}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          <h2 className="mt-4 text-heading-lg">Connector Properties</h2>
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
    <Alert className="overflow-auto" icon={<WarningIcon />} variant="warning">
      <AlertTitle>Submitted configuration is invalid</AlertTitle>
      <AlertDescription>
        <div>
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
