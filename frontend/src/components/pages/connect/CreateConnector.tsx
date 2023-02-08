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
import { message } from 'antd';
import { PageComponent, PageInitHelper } from '../Page';
import { ApiOutlined, DatabaseOutlined, SearchOutlined } from '@ant-design/icons';
import { Wizard, WizardStep } from '../../misc/Wizard';
import { observer } from 'mobx-react';
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
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { ConnectClusterStore, ConnectorValidationError } from '../../../state/connect/state';
const { Option } = Select;

const ConnectorType = observer(
    (p: {
        connectClusters: Array<ClusterConnectors>;
        activeCluster: string | null;
        onActiveClusterChange: (clusterName: string | null) => void;
        selectedPlugin: ConnectorPlugin | null;
        onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
    }) => {
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
                        <h2>Connector Type</h2>

                        <HiddenRadioList<ConnectorPlugin>
                            name={'connector-type'}
                            onChange={p.onPluginSelectionChange}
                            value={p.selectedPlugin ?? undefined}
                            options={
                                api.connectAdditionalClusterInfo.get(p.activeCluster)?.plugins.map((plugin) => ({
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
        const clusterName = this.props.clusterName;
        p.title = 'Create Connector';
        p.addBreadcrumb('Connectors', '/connect-clusters');
        p.addBreadcrumb(clusterName, `/connect-clusters/${clusterName}`);
        p.addBreadcrumb('Create Connector', `/connect-clusters/${clusterName}/create-connector`);

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshConnectClusters(force);
    }

    render() {
        const clusters = api.connectConnectors?.clusters;
        if (clusters == null) return null;

        return (
            <PageContent>
                <Section>
                    <div className={styles.wizardView}>
                        <ConnectorWizard connectClusters={clusters} activeCluster={this.props.clusterName} />
                    </div>
                </Section>
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
    const [stringifiedConfig, setStringifiedConfig] = useState<null | any>({});
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
                            { title: clusterName!, linkTo: `/connect-clusters/${clusterName}` },
                            { title: 'Create Connector', linkTo: `/connect-clusters/${clusterName}/create-connector` },
                        ];
                        history.push(`/connect-clusters/${clusterName}/create-connector`);
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
            description: 'Review created connector config.',
            icon: <SearchOutlined />,
            content: selectedPlugin && (
                <Review
                    connectorPlugin={selectedPlugin}
                    properties={stringifiedConfig}
                    onChange={(editorContent) => {
                        setStringifiedConfig(editorContent);
                    }}
                    invalidValidationResult={invalidValidationResult}
                    validationFailure={validationFailure}
                    creationFailure={creationFailure}
                    genericFailure={genericFailure}
                />
            ),
            postConditionMet: () => true,
            async transitionConditionMet(): Promise<{ conditionMet: boolean }> {
                clearErrors();

                const connectorRef = connectClusterStore.getConnector(selectedPlugin!.class);

                connectorRef.updateProperties(JSON.parse(stringifiedConfig));

                const propertiesObject: Record<string, any> = connectorRef.getConfigObject();
                try {
                    const validationResult = await api.validateConnectorConfig(activeCluster, selectedPlugin!.class, propertiesObject);

                    if (validationResult.error_count > 0) {
                        setInvalidValidationResult(validationResult);
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
                    return { conditionMet: false };
                }

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
                        return history.push(`/connect-clusters/${activeCluster}`);
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
}

function Review({
    connectorPlugin,
    properties,
    invalidValidationResult,
    validationFailure,
    creationFailure,
    genericFailure,
    onChange,
}: ReviewProps) {
    return (
        <>
            {connectorPlugin != null ? (
                <>
                    <h2>Connector Plugin</h2>
                    <ConnectorBoxCard connectorPlugin={connectorPlugin} borderStyle="dashed" borderWidth="medium" hoverable={false} />
                </>
            ) : null}

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
                <KowlEditor language="json" value={properties} height="600px" onChange={onChange} />
            </div>
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
