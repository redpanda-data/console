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

/* eslint-disable no-useless-escape */
import Section from '../../misc/Section';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import { pipelinesApi } from '../../../state/backendApi';
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { Link } from 'react-router-dom';
import { Box, Button, createStandaloneToast, DataTable, Flex, Image, SearchField, Text } from '@redpanda-data/ui';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Pipeline, Pipeline_State } from '../../../protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb';
import { encodeURIComponentPercents } from '../../../utils/utils';
import { CheckIcon } from '@chakra-ui/icons';
import { XIcon } from '@heroicons/react/solid';
import { openDeleteModal } from './modals';
import { TrashIcon } from '@heroicons/react/outline';
import EmptyConnectors from '../../../assets/redpanda/EmptyConnectors.svg';
import { Features } from '../../../state/supportedFeatures';
const { ToastContainer, toast } = createStandaloneToast();


export const PipelineStatus = observer((p: { status: Pipeline_State }) => {
    switch (p.status) {
        case Pipeline_State.UNSPECIFIED: return <Flex alignItems="center" gap="2"><XIcon color="orange" height="14px" /> Unspecified</Flex>;
        case Pipeline_State.STARTING: return <Flex alignItems="center" gap="2"><CheckIcon color="green" height="14px" /> Starting</Flex>;
        case Pipeline_State.RUNNING: return <Flex alignItems="center" gap="2"><CheckIcon color="green" height="14px" /> Running</Flex>;
        case Pipeline_State.STOPPING: return <Flex alignItems="center" gap="2"><XIcon color="red" height="14px" /> Stopping</Flex>;
        case Pipeline_State.STOPPED: return <Flex alignItems="center" gap="2"><XIcon color="red" height="14px" /> Stopped</Flex>;
        case Pipeline_State.ERROR: return <Flex alignItems="center" gap="2"><XIcon color="red" height="14px" /> Error</Flex>;
        default:
            return <> Unknown</>;
    }
});

export const PipelineThroughput = observer((p: { pipeline: Pipeline }) => {
    const { limit } = p.pipeline;
    if (!limit) return <></>

    return <>
        {limit.cpuShares}{' '}{limit.memoryShares}
    </>;
});

@observer
class RpConnectPipelinesList extends PageComponent<{}> {

    @observable placeholder = 5;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.addBreadcrumb('Redpanda Connect Pipelines', '/rp-connect');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        if (!Features.pipelinesApi) return;

        pipelinesApi.refreshPipelines(force);
    }

    render() {
        if (!pipelinesApi.pipelines) return DefaultSkeleton;

        const filteredPipelines = (pipelinesApi.pipelines ?? [])
            .filter(u => {
                const filter = uiSettings.pipelinesList.quickSearch;
                if (!filter) return true;
                try {
                    const quickSearchRegExp = new RegExp(filter, 'i');
                    if (u.id.match(quickSearchRegExp))
                        return true;
                    if (u.displayName.match(quickSearchRegExp))
                        return true;
                    return false;
                } catch { return false; }
            });

        return (
            <PageContent>
                <Section>
                    <ToastContainer />
                    {/* Pipeline List */}

                    <div style={{ display: 'flex', marginBottom: '.5em' }}>
                        <Link to={'/rp-connect/create'}><Button variant="solid" colorScheme="brand">Create pipeline</Button></Link>
                    </div>

                    <Box my={5}>
                        <SearchField width="350px"
                            searchText={uiSettings.pipelinesList.quickSearch}
                            setSearchText={x => uiSettings.pipelinesList.quickSearch = x}
                            placeholderText="Enter search term / regex..."
                        />
                    </Box>

                    {(pipelinesApi.pipelines ?? []).length == 0
                        ? <EmptyPlaceholder />
                        : <DataTable<Pipeline>
                            data={filteredPipelines}
                            pagination
                            defaultPageSize={10}
                            sorting
                            columns={[
                                {
                                    header: 'ID',
                                    cell: ({ row: { original } }) => (
                                        <Link to={`/rp-connect/${encodeURIComponentPercents(original.id)}`}>
                                            <Text>{original.id}</Text>
                                        </Link>
                                    ),
                                    size: 100,
                                },
                                {
                                    header: 'Pipeline Name',
                                    cell: ({ row: { original } }) => (
                                        <Link to={`/rp-connect/${encodeURIComponentPercents(original.id)}`}>
                                            <Text wordBreak="break-word" whiteSpace="break-spaces">{original.displayName}</Text>
                                        </Link>
                                    ),
                                    size: Infinity
                                },
                                {
                                    header: 'Description',
                                    accessorKey: 'description',
                                    size: 100,
                                },
                                {
                                    header: 'State',
                                    cell: ({ row: { original } }) => {
                                        return <>
                                            <PipelineStatus status={original.state} />
                                        </>
                                    }
                                },
                                // {
                                //     header: 'Throughput',
                                //     cell: ({ row: { original } }) => {
                                //         return <>
                                //             <PipelineThroughput pipeline={original} />
                                //         </>
                                //     },
                                //     size: 100,
                                // },
                                {
                                    header: '',
                                    id: 'actions',
                                    cell: ({ row: { original: r } }) =>
                                        <Button variant="icon"
                                            height="16px" color="gray.500"
                                            // disabledReason={api.userData?.canDeleteTransforms === false ? 'You don\'t have the \'canDeleteTransforms\' permission' : undefined}
                                            onClick={e => {
                                                e.stopPropagation();
                                                e.preventDefault();

                                                openDeleteModal(r.displayName, () => {
                                                    pipelinesApi.deletePipeline(r.id)
                                                        .then(async () => {
                                                            toast({
                                                                status: 'success', duration: 4000, isClosable: false,
                                                                title: 'Pipeline deleted'
                                                            });
                                                            pipelinesApi.refreshPipelines(true);
                                                        })
                                                        .catch(err => {
                                                            toast({
                                                                status: 'error', duration: null, isClosable: true,
                                                                title: 'Failed to delete pipeline',
                                                                description: String(err),
                                                            })
                                                        });
                                                })

                                            }}>
                                            <TrashIcon />
                                        </Button>,
                                    size: 1
                                },
                            ]}
                            emptyText=""
                        />
                    }
                </Section>
            </PageContent>
        );
    }
}

export default RpConnectPipelinesList;

const EmptyPlaceholder = () => {
    return <Flex alignItems="center" justifyContent="center" flexDirection="column" gap="4" mb="4">
        <Image src={EmptyConnectors} />
        <Box>You have no Redpanda Connect pipelines.</Box>
        <Link to="/rp-connect/create">
            <Button variant="solid">Create pipeline</Button>
        </Link>
    </Flex>
};
