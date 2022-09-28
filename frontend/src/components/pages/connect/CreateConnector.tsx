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

import React, { useState } from 'react';
import { PageComponent, PageInitHelper } from '../Page';
import {
    ApiOutlined,
    DatabaseOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { Wizard, WizardStep } from '../../misc/Wizard';
import { observer } from 'mobx-react';
import { api } from '../../../state/backendApi';
import { appGlobal } from '../../../state/appGlobal';
import {
    ClusterConnectors,
    ConnectorValidationResult,
} from '../../../state/restInterfaces';
import { Alert, Select, Table } from 'antd';
import { HiddenRadioList } from '../../misc/HiddenRadioList';
import { ConnectorBoxCard, ConnectorPlugin } from './ConnectorBoxCard';
import { ConfigPage } from './dynamic-ui/components';
import KowlEditor from '../../misc/KowlEditor';
import { useHistory } from 'react-router-dom';

import styles from './CreateConnector.module.scss';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';

const { Option } = Select;

interface ConnectorTypeProps {
    connectClusters: Array<ClusterConnectors>;
    activeCluster: string | null;
    onActiveClusterChange: (clusterName: string | null) => void;
    selectedPlugin: ConnectorPlugin | null;
    onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
}

const ConnectorType = observer(({
    connectClusters,
    activeCluster,
    onActiveClusterChange,
    selectedPlugin,
    onPluginSelectionChange,
}: ConnectorTypeProps) => {
    return (<>
        <h2>Installation Target</h2>
        <Select<string> style={{ minWidth: '300px' }}
            placeholder="Choose Connect Cluster…"
            onChange={(clusterName) => {
                api.refreshClusterAdditionalInfo(clusterName, true);
                onActiveClusterChange(clusterName);
            }}
            value={activeCluster ?? undefined}
        >
            {connectClusters.map(({ clusterName }) => <Option key={clusterName} value={clusterName}>{clusterName}</Option>)}
        </Select>

        {activeCluster && <>
            <h2>Connector Type</h2>

            <HiddenRadioList<ConnectorPlugin>
                name={'connector-type'}
                onChange={onPluginSelectionChange}
                value={selectedPlugin ?? undefined}
                options={api.connectAdditionalClusterInfo.get(activeCluster)?.plugins.map(plugin => ({
                    value: plugin,
                    render: (card) => <ConnectorBoxCard {...card} connectorPlugin={plugin} />,
                })) || []} />
        </>}
    </>);
});

@observer
class CreateConnector extends PageComponent {
    initPage(p: PageInitHelper) {
        p.title = 'Create Connector';
        p.addBreadcrumb('Create Connector', '/create-connector');

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
                        <ConnectorWizard connectClusters={clusters} />
                    </div>
                </Section>
            </PageContent>
        );
    }
}

interface ConnectorWizardProps {
    connectClusters: Array<ClusterConnectors>;
}

function ConnectorWizard({ connectClusters }: ConnectorWizardProps) {
    const history = useHistory();

    const [currentStep, setCurrentStep] = useState(0);
    const [activeCluster, setActiveCluster] = useState<string | null>(null);
    const [selectedPlugin, setSelectedPlugin] = useState<ConnectorPlugin | null>(
        null);
    const [properties, setProperties] = useState('');
    const [invalidValidationResult, setInvalidValidationResult] = useState<ConnectorValidationResult | null>(
        null);
    const [validationFailure, setValidationFailure] = useState<unknown>(null);
    const [creationFailure, setCreationFailure] = useState<unknown>(null);
    const [genericFailure, setGenericFailure] = useState<Error | null>(null);

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
            content: <ConnectorType
                connectClusters={connectClusters}
                activeCluster={activeCluster}
                onActiveClusterChange={setActiveCluster}
                selectedPlugin={selectedPlugin}
                onPluginSelectionChange={setSelectedPlugin}
            />,
            postConditionMet: () => activeCluster != null && selectedPlugin != null,
        }, {
            title: 'Properties',
            description: 'Configure basic connection properties.',
            icon: <ApiOutlined />,
            content: <>
                {selectedPlugin != null
                    ? <div className={styles.connectorBoxCard}>
                        <ConnectorBoxCard
                            id="selectedConnector"
                            connectorPlugin={selectedPlugin}
                            borderStyle={'dashed'}
                            borderWidth={'medium'}
                            hoverable={false} />
                    </div>
                    : null}
                {(activeCluster && selectedPlugin)
                    ? <ConfigPage clusterName={activeCluster!}
                        pluginClassName={selectedPlugin!.class}
                        onChange={setProperties} />
                    : <div>no cluster or plugin selected</div>
                }
            </>,
            postConditionMet: () => true,
        },
        // {
        //   title: 'Additional Properties',
        //   description: 'Add advanced connector configs, SMTs, etc.',
        //   icon: <SettingOutlined/>,
        //   content: 'More config options...',
        //   postConditionMet: () => true,
        // },
        {
            title: 'Review',
            description: 'Review and optionally patch the created connector config.',
            icon: <SearchOutlined />,
            content: <Review
                connectorPlugin={selectedPlugin}
                properties={properties}
                onChange={editorContent => setProperties(String(editorContent))}
                invalidValidationResult={invalidValidationResult}
                validationFailure={validationFailure}
                creationFailure={creationFailure}
                genericFailure={genericFailure}
            />,
            postConditionMet: () => true,
            async transitionConditionMet(): Promise<{ conditionMet: boolean }> {
                clearErrors();
                try {
                    const propertiesObject = JSON.parse(properties);

                    try {
                        const validationResult = await api.validateConnectorConfig(
                            activeCluster!, selectedPlugin!.class,
                            JSON.parse(properties));

                        if (validationResult.error_count > 0) {
                            setInvalidValidationResult(validationResult);
                            return { conditionMet: false };
                        }
                    } catch (e) {
                        setValidationFailure(e);
                        return { conditionMet: false };
                    }

                    try {
                        await api.createConnector(activeCluster!, propertiesObject.name,
                            selectedPlugin!.class, propertiesObject);
                    } catch (e) {
                        setCreationFailure(e);
                        return { conditionMet: false };
                    }
                } catch (e: any) {
                    setGenericFailure(e);
                    return { conditionMet: false };
                }

                return { conditionMet: true };
            },
        }];

    const isLast = () => currentStep === steps.length - 1;

    return <Wizard state={{
        canContinue: () => steps[currentStep].postConditionMet(),
        next: async () => {
            const transitionConditionMet = steps[currentStep].transitionConditionMet;
            if (transitionConditionMet) {
                const { conditionMet } = await transitionConditionMet();
                if (!conditionMet) return;
            }

            if (isLast()) {
                return history.push(`/kafka-connect/${activeCluster}`);
            }

            return currentStep < steps.length - 1
                ? setCurrentStep(n => n + 1)
                : undefined;
        },
        previous: () => currentStep > 0 ? setCurrentStep(n => n - 1) : undefined,
        isLast,
        isFirst: () => currentStep === 0,
        getCurrentStep: () => [currentStep, steps[currentStep]],
        getSteps: () => steps
    }} />;
}

interface ReviewProps {
    connectorPlugin: ConnectorPlugin | null;
    properties?: string;
    onChange: (editorContent: string | undefined) => void;
    invalidValidationResult: ConnectorValidationResult | null;
    validationFailure: unknown;
    creationFailure: unknown;
    genericFailure: Error | null;
}

function Review({
    connectorPlugin,
    properties,
    onChange,
    invalidValidationResult,
    validationFailure,
    creationFailure,
    genericFailure,
}: ReviewProps) {

    return <>
        {connectorPlugin != null
            ? <>
                <h2>Connector Plugin</h2>
                <ConnectorBoxCard
                    connectorPlugin={connectorPlugin}
                    borderStyle="dashed"
                    borderWidth="medium"
                    hoverable={false} />
            </>
            : null
        }

        {invalidValidationResult != null
            ? <ValidationDisplay validationResult={invalidValidationResult} />
            : null
        }

        {validationFailure
            ? <Alert style={{ marginTop: '2rem' }} type="error" message={<>
                <strong>Validation attempt failed</strong>
                <p>{String(validationFailure)}</p>
            </>} />
            : null
        }

        {creationFailure
            ? <Alert style={{ marginTop: '2rem' }} type="error" message={<>
                <strong>Creation attempt failed</strong>
                <p>{String(creationFailure)}</p>
            </>} />
            : null}

        {genericFailure
            ? <Alert style={{ marginTop: '2rem' }} type="error" message={<>
                <strong>An error occurred</strong>
                <p>{String(creationFailure)}</p>
            </>} />
            : null}

        <h2>Connector Properties</h2>
        <div style={{ margin: '0 auto 1.5rem' }}>
            <KowlEditor
                language="json"
                value={properties}
                onChange={onChange}
                height="600px"
            />
        </div>
    </>;
}

function getDataSource(validationResult: ConnectorValidationResult) {
    return validationResult.configs.filter(connectorProperty => connectorProperty.value.errors.length > 0)
        .map(cp => cp.value);
}

function ValidationDisplay({ validationResult }: { validationResult: ConnectorValidationResult }) {
    return <Alert style={{ marginTop: '2rem' }} type="warning" message={<>
        <h3>Submitted configuration is invalid</h3>

        <Table pagination={false} size={'small'} dataSource={getDataSource(validationResult)} columns={[
            {
                title: 'Property Name',
                dataIndex: 'name',
                key: 'name',
            }, {
                title: 'Current Value',
                dataIndex: 'value',
                key: 'value',
            }, {
                title: 'Validation Errors',
                dataIndex: 'errors',
                key: 'errors',
            },
        ]} rowKey={record => record.name} />
    </>} />;
}

export default CreateConnector;
