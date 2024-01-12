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
import { PageComponent, PageInitHelper } from '../Page';
import { ApiOutlined, DatabaseOutlined, SearchOutlined } from '@ant-design/icons';
import { Wizard, WizardStep } from '../../misc/Wizard';
import { observer, useLocalObservable } from 'mobx-react';
import { api } from '../../../state/backendApi';
import { uiState } from '../../../state/uiState';
import { appGlobal } from '../../../state/appGlobal';
import { ClusterConnectors, ConnectorValidationResult } from '../../../state/restInterfaces';
import { HiddenRadioList } from '../../misc/HiddenRadioList';
import { ConnectorBoxCard, ConnectorPlugin, getConnectorFriendlyName } from './ConnectorBoxCard';
import { ConfigPage } from './dynamic-ui/components';
import KowlEditor from '../../misc/KowlEditor';
import PageContent from '../../misc/PageContent';
import { ConnectClusterStore, ConnectorValidationError } from '../../../state/connect/state';
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
    useToast
} from '@redpanda-data/ui';
import { findConnectorMetadata } from './helper';
import { containsIgnoreCase, delay, TimeSince } from '../../../utils/utils';

import { SingleSelect } from '../../misc/Select';

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


        let filteredPlugins = [] as {
            class: string;
            type: 'sink' | 'source';
            version?: string | undefined;
        }[];

        if (p.activeCluster) {
            const allPlugins = api.connectAdditionalClusterInfo.get(p.activeCluster)?.plugins;

            filteredPlugins = allPlugins?.filter(p => {
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
            }) || [];
        }

        const noResultsBox = (filteredPlugins?.length > 0) ? null : <>
            <Flex p="10" alignItems="center" justifyContent="center" background="blackAlpha.100" borderRadius="8px">
                <Text fontSize="large" color="gray">No connectors that match the search filters</Text>
            </Flex>
        </>


        return (
            <>
                {p.connectClusters.length > 1 && (
                    <>
                        <h2>Installation Target</h2>
                        <Box maxWidth={400}>
                            <SingleSelect<string | undefined>
                                options={p.connectClusters.map(({clusterName}) => ({
                                    value: clusterName,
                                    label: clusterName,
                                }))}
                                value={p.activeCluster ?? undefined}
                                onChange={p.onActiveClusterChange as (val: string | null | undefined) => void}
                            />
                        </Box>
                    </>
                )}

                {p.activeCluster && (
                    <>
                        <Flex direction="column" gap="1em">
                            <Box maxWidth="600px">
                                <Text>
                                    Select a managed connector. Connectors simplify importing and exporting data between Redpanda and popular data sources.
                                    {' '}
                                    <Link href="https://docs.redpanda.com/docs/deploy/deployment-option/cloud/managed-connectors/">Learn more</Link>
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

                        <Tabs items={[
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
                            onChange={(_, key) => {
                                state.tabFilter = key as typeof tabFilterModes[number];
                            }}
                        />

                        <HiddenRadioList<ConnectorPlugin>
                            name={'connector-type'}
                            onChange={p.onPluginSelectionChange}
                            value={p.selectedPlugin ?? undefined}
                            options={filteredPlugins.map((plugin) => ({
                                value: plugin,
                                render: (card) => <ConnectorBoxCard {...card} connectorPlugin={plugin} />,
                            }))}
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

        this.refreshData(true);
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
    const toast = useToast()
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
    const { isOpen: isCreatingModalOpen, onOpen: openCreatingModal, onClose: closeCreatingModal } = useDisclosure();

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
                    onPluginSelectionChange={e => {
                        setSelectedPlugin(e);
                        setCurrentStep(1);
                    }}
                />
            ),
            postConditionMet: () => activeCluster != null && selectedPlugin != null,
            nextButtonLabel: null,
        },
        {
            title: 'Properties',
            description: 'Configure basic connection properties.',
            icon: <ApiOutlined />,
            content: (
                <>
                    <CreateConnectorHeading plugin={selectedPlugin} />

                    {selectedPlugin ? (
                        <Box maxWidth="800px">
                            <ConfigPage connectorStore={connectClusterStore.getConnector(selectedPlugin.class)} context="CREATE" />
                        </Box>
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

                    const errorCount = validationResult.configs.sum(x => x.value.errors.length);

                    if (errorCount > 0) {
                        setInvalidValidationResult(validationResult);
                        setLoading(false);
                        return { conditionMet: false };
                    }
                } catch (e) {
                    throw new ConnectorValidationError(e);
                }

                try {
                    openCreatingModal();

                    await connectClusterStore.createConnector(selectedPlugin!.class, parsedUpdatedConfig);

                    // Wait a bit for the connector to appear, then navigate to it
                    const maxScanTime = 5000;
                    const intervalSec = 100;
                    const timer = new TimeSince();

                    const connectorName = connectorRef.propsByName.get('name')!.value as string;

                    while (true) {
                        const elapsedTime = timer.value;
                        console.log('scanning for new connector...', { connectorName, elapsedTime });
                        if (elapsedTime > maxScanTime) {
                            // Abort, tried to wait for too long
                            history.push(`/connect-clusters/${encodeURIComponent(activeCluster)}`);
                            break;
                        }

                        await connectClusterStore.refreshData(true);
                        const connector = connectClusterStore.getConnectorState(connectorName);

                        if (connector) {
                            // Success
                            history.push(`/connect-clusters/${encodeURIComponent(activeCluster)}/${encodeURIComponent(connectorName)}`);
                            break;
                        }

                        await delay(intervalSec);
                    }
                    toast({
                        status: 'success',
                        description: `Connector ${connectorName} created`}
                    );

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
                finally {
                    closeCreatingModal();
                }
                setLoading(false);
                return { conditionMet: true };
            },
            nextButtonLabel: 'Create'
        },
    ];

    const isLast = () => currentStep === steps.length - 1;

    if (!connectClusterStore.isInitialized) {
        return (
            <Skeleton mt={5} noOfLines={20} height={4} />
        );
    }

    return <>
        <Wizard
            state={{
                canContinue: () => steps[currentStep].postConditionMet(),
                next: async () => {
                    const transitionConditionMet = steps[currentStep].transitionConditionMet;
                    if (transitionConditionMet) {
                        const { conditionMet } = await transitionConditionMet();
                        if (!conditionMet) return;
                    }

                    setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }, 10);

                    return currentStep < steps.length - 1 ? setCurrentStep((n) => n + 1) : undefined;
                },
                previous: () => {

                    clearErrors();

                    setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }, 10);

                    return (currentStep > 0 ? setCurrentStep((n) => n - 1) : undefined);
                },
                isLast,
                isFirst: () => currentStep === 0,
                getCurrentStep: () => [currentStep, steps[currentStep]],
                getSteps: () => steps,
            }}
        />

        <Modal isCentered isOpen={isCreatingModalOpen} onClose={() => { }}>
            <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(5px)" />
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
});



function CreateConnectorHeading(p: { plugin: ConnectorPlugin | null }) {
    if (!p.plugin)
        return <Heading>Creating Connector</Heading>

    // const { logo } = findConnectorMetadata(p.plugin.class) ?? {};
    const displayName = getConnectorFriendlyName(p.plugin.class);

    return <>
        <Heading as="h1" fontSize="2xl" display="flex" alignItems="center" gap=".5ch" mb="8">
            <>Create Connector: </>
            {p.plugin.type == 'source' ? 'import data from ' : 'export data to '}
            {displayName}
            {/* <Box width="28px" height="28px" mr="1">{logo}</Box> */}
        </Heading>
    </>
}



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
                <Skeleton mt={5} noOfLines={6} height={4} />
            ) : (
                <>
                    {invalidValidationResult != null ? <ValidationDisplay validationResult={invalidValidationResult} /> : null}

                    {validationFailure ? (
                        <Alert
                            status="error"
                            variant="left-accent"
                            my={4}
                        >
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
                        <Alert
                            status="error"
                            variant="left-accent"
                            my={4}
                        >
                            <AlertIcon/>
                            <AlertDescription>
                                <Box>
                                    <Text as="h3">Creation attempt failed</Text>
                                    <Text>{String(creationFailure)}</Text>
                                </Box>
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    {genericFailure ? (
                        <Alert
                            status="error"
                            variant="left-accent"
                            my={4}
                        >
                            <AlertIcon/>
                            <AlertDescription>
                                <Box>
                                    <Text as="h3">An error occurred</Text>
                                    <Text>{String(genericFailure)}</Text>
                                </Box>
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    <Heading as="h2" mt="4" fontSize="1.4em" fontWeight="500">Connector Properties</Heading>
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
            status="warning"
            variant="left-accent"
            my={4}
            overflow="auto"
        >
            <AlertDescription>
                <Box>
                    <Text as="h3" mb={4}>Submitted configuration is invalid</Text>
                    <DataTable<{name: string, value: string | null, recommended_values: string[], errors: string[], visible: boolean}>
                        data={getDataSource(validationResult)}
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
                    />
                </Box>
            </AlertDescription>
        </Alert>
    )
}

export default CreateConnector;
