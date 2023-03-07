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

import React, { useEffect, useState } from 'react';
import { comparer } from 'mobx';
import { message } from 'antd';
import { PageComponent, PageInitHelper } from '../Page';
import { ApiOutlined, DatabaseOutlined, SearchOutlined } from '@ant-design/icons';
import { Wizard, WizardStep } from '../../misc/Wizard';
import { observer, useLocalObservable } from 'mobx-react';
import { api } from '../../../state/backendApi';
import { uiState } from '../../../state/uiState';
import { appGlobal } from '../../../state/appGlobal';
import { ClusterConnectors, ConnectorValidationResult } from '../../../state/restInterfaces';
import { Alert, Select, Skeleton, Table } from 'antd';
import { HiddenRadioList } from '../../misc/HiddenRadioList';
import { ConnectorBoxCard, ConnectorPlugin } from './ConnectorBoxCard';
import { /* ConfigPage */ ConfigPage } from './dynamic-ui/components';
import KowlEditor from '../../misc/KowlEditor';
// import { useHistory } from 'react-router-dom';

import styles from './CreateConnector.module.scss';
import PageContent from '../../misc/PageContent';
import { ConnectClusterStore, ConnectorValidationError } from '../../../state/connect/state';
import { Flex, Text, Tabs, Link, SearchField, Box } from '@redpanda-data/ui';
import { findConnectorMetadata } from './helper';
import { containsIgnoreCase } from '../../../utils/utils';
const { Option } = Select;

const ConnectorType = observer(
    (p: {
        connectClusters: Array<ClusterConnectors>;
        activeCluster: string | null;
        onActiveClusterChange: (clusterName: string | null) => void;
        selectedPlugin: ConnectorPlugin | null;
        onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
    }) => {

        const tabFilterModes = ['all', 'export', 'import'] as const;
        const state = useLocalObservable(() => ({
            textFilter: '',
            tabFilter: 'all' as 'all' | 'export' | 'import'
        }));


        return (
            <>
                {p.connectClusters.length > 1 && (
                    <>
                        <h2>Installation Target</h2>
                        <Select<string>
                            style={{ minWidth: '300px' }}
                            placeholder="Choose Connect Cluster…"
                            onChange={(clusterName) => {
                                p.onActiveClusterChange(clusterName);
                            }}
                            value={p.activeCluster ?? undefined}
                        >
                            {p.connectClusters.map(({ clusterName }) => (
                                <Option key={clusterName} value={clusterName}>
                                    {clusterName}
                                </Option>
                            ))}
                        </Select>
                    </>
                )}

                {p.activeCluster && (
                    <>
                        <Flex direction="column" gap="1em">
                            <Text fontSize="x-large" fontWeight="semibold">
                                Create Connector
                            </Text>
                            <Box maxWidth="600px">
                                <Text>
                                    Select a managed connector. Connectors simplify importing and exporting data between Redpanda and popular data sources.
                                    {' '}
                                    <Link href="">Learn more</Link>
                                </Text>

                                <Box marginBlock="4" marginTop="8">
                                    <SearchField
                                        placeholderText="Search"
                                        searchText={state.textFilter}
                                        setSearchText={x => state.textFilter = x}
                                        icon="filter"
                                    />
                                </Box>
                            </Box>
                        </Flex>

                        <Tabs isLazy items={[
                            {
                                key: 'all',
                                name: 'All',
                                component: <></>
                            },
                            {
                                key: 'export',
                                name: 'Export to',
                                component: <></>
                            },
                            {
                                key: 'import',
                                name: 'Import from',
                                component: <></>
                            },
                        ]} marginBlock="2"
                            onChange={index => state.tabFilter = tabFilterModes[index]}
                            tabIndex={tabFilterModes.indexOf(state.tabFilter)}
                        />

                        <HiddenRadioList<ConnectorPlugin>
                            name={'connector-type'}
                            onChange={p.onPluginSelectionChange}
                            value={p.selectedPlugin ?? undefined}
                            options={
                                api.connectAdditionalClusterInfo
                                    .get(p.activeCluster)?.plugins
                                    .filter(p => {
                                        if (state.tabFilter == 'export' && p.type == 'source')
                                            return false; // not an "export" type

                                        if (state.tabFilter == 'import' && p.type == 'sink')
                                            return false; // not an "import" type

                                        const meta = findConnectorMetadata(p.class);
                                        if (!meta)
                                            return true; // no metadata, show it always

                                        if (state.textFilter) {
                                            let matchesFilter = false;

                                            if (meta.friendlyName && containsIgnoreCase(meta.friendlyName, state.textFilter))
                                                matchesFilter = true;

                                            if (p.class && containsIgnoreCase(p.class, state.textFilter))
                                                matchesFilter = true;

                                            if (meta.description && containsIgnoreCase(meta.description, state.textFilter))
                                                matchesFilter = true;

                                            if (!matchesFilter)
                                                return false; // doesn't match the text filter
                                        }

                                        // no filters active that would remove the entry from the list
                                        return true;
                                    })
                                    .map((plugin) => ({
                                        value: plugin,
                                        render: (card) => <ConnectorBoxCard {...card} connectorPlugin={plugin} />,
                                    })) || []
                            }
                        />
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

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConnectClusters(force);
    }

    render() {
        const clusters = api.connectConnectors?.clusters;
        if (clusters == null) return null;
        const clusterName = decodeURIComponent(this.props.clusterName);

        return (
            <PageContent>
                <ConnectorWizard connectClusters={clusters} activeCluster={clusterName} />
                {/*
                <Section>
                    <div className={styles.wizardView}>

                    </div>
                </Section> */}
            </PageContent>
        );
    }
}

interface ConnectorWizardProps {
    connectClusters: Array<ClusterConnectors>;
    activeCluster: string;
}

const ConnectorWizard = observer(({ connectClusters, activeCluster }: ConnectorWizardProps) => {
    const history = appGlobal.history;
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedPlugin, setSelectedPlugin] = useState<ConnectorPlugin | null>(null);
    const [invalidValidationResult, setInvalidValidationResult] = useState<ConnectorValidationResult | null>(null);
    const [validationFailure, setValidationFailure] = useState<unknown>(null);
    const [creationFailure, setCreationFailure] = useState<unknown>(null);
    const [genericFailure, setGenericFailure] = useState<Error | null>(null);
    const [stringifiedConfig, setStringifiedConfig] = useState<string>('');
    const [parsedUpdatedConfig, setParsedUpdatedConfig] = useState<any | null>(null);
    const [postCondition, setPostCondition] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [connectClusterStore, setConnectClusterStore] = useState(ConnectClusterStore.getInstance(activeCluster));

    useEffect(() => {
        const init = async () => {
            await connectClusterStore.setup();
        };
        init();
    }, [connectClusterStore]);

    useEffect(() => {
        setConnectClusterStore(ConnectClusterStore.getInstance(activeCluster));
    }, [activeCluster]);

    useEffect(() => {
        try {
            setParsedUpdatedConfig(JSON.parse(stringifiedConfig));
        } catch (e) {
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

    const steps: Array<WizardStep> = [
        {
            title: 'Connector Type',
            description: 'Choose type of connector.',
            icon: <DatabaseOutlined />,
            content: (
                <ConnectorType
                    connectClusters={connectClusters}
                    activeCluster={activeCluster}
                    onActiveClusterChange={(clusterName) => {
                        uiState.pageBreadcrumbs = [
                            { title: 'Connectors', linkTo: '/connect-clusters' },
                            { title: clusterName!, linkTo: `/connect-clusters/${encodeURIComponent(clusterName!)}` },
                            { title: 'Create Connector', linkTo: `/connect-clusters/${encodeURIComponent(clusterName!)}/create-connector` },
                        ];
                        history.push(`/connect-clusters/${encodeURIComponent(clusterName!)}/create-connector`);
                    }}
                    selectedPlugin={selectedPlugin}
                    onPluginSelectionChange={setSelectedPlugin}
                />
            ),
            postConditionMet: () => activeCluster != null && selectedPlugin != null,
        },
        {
            title: 'Properties',
            description: 'Configure basic connection properties.',
            icon: <ApiOutlined />,
            content: (
                <>
                    {selectedPlugin != null ? (
                        <div className={styles.connectorBoxCard}>
                            <ConnectorBoxCard
                                id="selectedConnector"
                                connectorPlugin={selectedPlugin}
                                borderStyle={'dashed'}
                                borderWidth={'medium'}
                                hoverable={false}
                            />
                        </div>
                    ) : null}
                    {selectedPlugin ? (
                        <ConfigPage connectorStore={connectClusterStore.getConnector(selectedPlugin.class)} />
                    ) : (
                        <div>no cluster or plugin selected</div>
                    )}
                </>
            ),
            transitionConditionMet: async () => {
                if (selectedPlugin) {
                    connectClusterStore.getConnector(selectedPlugin.class).getConfigObject();
                    setStringifiedConfig(connectClusterStore.getConnector(selectedPlugin.class).jsonText);
                    return { conditionMet: true };
                }
                return { conditionMet: false };
            },
            postConditionMet: () => true,
        },
        {
            title: 'Review',
            description: 'Review and optionally patch the created connector config.',
            icon: <SearchOutlined />,
            content: selectedPlugin && (
                <Review
                    connectorPlugin={selectedPlugin}
                    properties={stringifiedConfig}
                    onChange={(editorContent) => {
                        setStringifiedConfig(editorContent ?? '');
                    }}
                    invalidValidationResult={invalidValidationResult}
                    validationFailure={validationFailure}
                    creationFailure={creationFailure}
                    genericFailure={genericFailure}
                    isCreating={loading}
                />
            ),
            postConditionMet: () => postCondition && !loading,
            async transitionConditionMet(): Promise<{ conditionMet: boolean }> {
                clearErrors();
                setLoading(true);
                const connectorRef = connectClusterStore.getConnector(selectedPlugin!.class);

                if (parsedUpdatedConfig != null && !comparer.shallow(parsedUpdatedConfig, connectorRef.getConfigObject())) {
                    connectorRef.updateProperties(parsedUpdatedConfig);
                }

                const propertiesObject: Record<string, any> = connectorRef.getConfigObject();
                try {
                    const validationResult = await api.validateConnectorConfig(activeCluster, selectedPlugin!.class, propertiesObject);

                    if (validationResult.error_count > 0) {
                        setInvalidValidationResult(validationResult);
                        setLoading(false);
                        return { conditionMet: false };
                    }
                } catch (e) {
                    throw new ConnectorValidationError(e);
                }

                try {
                    await connectClusterStore.createConnector(selectedPlugin!.class);
                    message.success({ content: `Connector ${connectorRef?.propsByName.get('name')?.value ?? ''} created correctly` });
                } catch (e: any) {
                    switch (e?.name) {
                        case 'ConnectorValidationError':
                            setValidationFailure(e?.message);
                            break;
                        case 'ConnectorCreationError':
                            setCreationFailure(e?.message);
                            break;
                        default:
                            setGenericFailure(e?.message);
                    }
                    setLoading(false);
                    return { conditionMet: false };
                }
                setLoading(false);
                return { conditionMet: true };
            },
        },
    ];

    const isLast = () => currentStep === steps.length - 1;

    if (!connectClusterStore.isInitialized)
        return (
            <div>
                <Skeleton loading={true} active={true} paragraph={{ rows: 20, width: '100%' }} />
            </div>
        );

    return (
        <Wizard
            state={{
                canContinue: () => steps[currentStep].postConditionMet(),
                next: async () => {
                    const transitionConditionMet = steps[currentStep].transitionConditionMet;
                    if (transitionConditionMet) {
                        const { conditionMet } = await transitionConditionMet();
                        if (!conditionMet) return;
                    }

                    if (isLast()) {
                        return history.push(`/connect-clusters/${encodeURIComponent(activeCluster)}`);
                    }

                    return currentStep < steps.length - 1 ? setCurrentStep((n) => n + 1) : undefined;
                },
                previous: () => (currentStep > 0 ? setCurrentStep((n) => n - 1) : undefined),
                isLast,
                isFirst: () => currentStep === 0,
                getCurrentStep: () => [currentStep, steps[currentStep]],
                getSteps: () => steps,
            }}
        />
    );
});

interface ReviewProps {
    connectorPlugin: ConnectorPlugin | null;
    onChange: (editorContent: string | undefined) => void;
    properties?: string;
    invalidValidationResult: ConnectorValidationResult | null;
    validationFailure: unknown;
    creationFailure: unknown;
    genericFailure: Error | null;
    isCreating: boolean;
}

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
                    <ConnectorBoxCard connectorPlugin={connectorPlugin} borderStyle="dashed" borderWidth="medium" hoverable={false} />
                </>
            ) : null}

            {isCreating ? (
                <>
                    <Skeleton loading={true} active={true} paragraph={{ rows: 5, width: '100%' }} style={{ marginTop: 20 }} />
                </>
            ) : (
                <>
                    {invalidValidationResult != null ? <ValidationDisplay validationResult={invalidValidationResult} /> : null}

                    {validationFailure ? (
                        <Alert
                            style={{ marginTop: '2rem' }}
                            type="error"
                            message={
                                <>
                                    <strong>Validation attempt failed</strong>
                                    <p>{String(validationFailure)}</p>
                                </>
                            }
                        />
                    ) : null}

                    {creationFailure ? (
                        <Alert
                            style={{ marginTop: '2rem' }}
                            type="error"
                            message={
                                <>
                                    <strong>Creation attempt failed</strong>
                                    <p>{String(creationFailure)}</p>
                                </>
                            }
                        />
                    ) : null}

                    {genericFailure ? (
                        <Alert
                            style={{ marginTop: '2rem' }}
                            type="error"
                            message={
                                <>
                                    <strong>An error occurred</strong>
                                    <p>{String(genericFailure)}</p>
                                </>
                            }
                        />
                    ) : null}

                    <h2>Connector Properties</h2>
                    <div style={{ margin: '0 auto 1.5rem' }}>
                        <KowlEditor
                            language="json"
                            value={properties}
                            height="600px"
                            onChange={onChange}
                            options={{ readOnly: isCreating }}
                        />
                    </div>
                </>
            )}
        </>
    );
}

function getDataSource(validationResult: ConnectorValidationResult) {
    return validationResult.configs.filter((connectorProperty) => connectorProperty.value.errors.length > 0).map((cp) => cp.value);
}

function ValidationDisplay({ validationResult }: { validationResult: ConnectorValidationResult }) {
    return (
        <Alert
            style={{ marginTop: '2rem' }}
            type="warning"
            message={
                <>
                    <h3>Submitted configuration is invalid</h3>

                    <Table
                        pagination={false}
                        size={'small'}
                        dataSource={getDataSource(validationResult)}
                        columns={[
                            {
                                title: 'Property Name',
                                dataIndex: 'name',
                                key: 'name',
                            },
                            {
                                title: 'Current Value',
                                dataIndex: 'value',
                                key: 'value',
                            },
                            {
                                title: 'Validation Errors',
                                dataIndex: 'errors',
                                key: 'errors',
                            },
                        ]}
                        rowKey={(record) => record.name}
                    />
                </>
            }
        />
    );
}

export default CreateConnector;
