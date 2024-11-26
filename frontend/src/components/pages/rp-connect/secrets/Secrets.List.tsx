import React from 'react';
import {PageComponent, PageInitHelper} from '../../Page';
import {observer} from 'mobx-react';
import {appGlobal} from '../../../../state/appGlobal';
import {rpcnSecretManagerApi} from '../../../../state/backendApi';
import {Features} from '../../../../state/supportedFeatures';
import {Box, Button, ButtonGroup, Code, ConfirmItemDeleteModal, CopyButton, createStandaloneToast, DataTable, Flex, Image, SearchField, Text, Tooltip} from '@redpanda-data/ui';
import Section from '../../../misc/Section';
import PageContent from '../../../misc/PageContent';
import {uiSettings} from '../../../../state/ui';
import {Link} from 'react-router-dom';
import {PencilIcon, TrashIcon} from '@heroicons/react/outline';
import EmptyConnectors from '../../../../assets/redpanda/EmptyConnectors.svg';
import {DeleteSecretRequest, Secret} from '../../../../protogen/redpanda/api/dataplane/v1alpha2/secret_pb';

const {ToastContainer, toast} = createStandaloneToast();

const CreateSecretButton = () => {
    return (<Box style={{display: 'flex', marginBottom: '.5em'}}>
        <Link to={'/rp-connect/secret/create'}><Button>Create secret</Button></Link>
    </Box>)
}

const EmptyPlaceholder = () => {
    return <Flex alignItems="center" justifyContent="center" flexDirection="column" gap="4" mb="4">
        <Image src={EmptyConnectors}/>
        <Box>You have no Redpanda Connect secrets.</Box>
        <CreateSecretButton/>
    </Flex>
};

@observer
class RpConnectSecretsList extends PageComponent {

    initPage(p: PageInitHelper) {
        p.addBreadcrumb('Redpanda Connect Secret Manager', '/rp-connect/secrets');
        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        if (!Features.pipelinesApi) return;

        rpcnSecretManagerApi.refreshSecrets(force)
            .catch((err) => {
                if (String(err).includes('404')) {
                    // Hacky special handling for OSS version, it is possible for the /endpoints request to not complete in time for this to render
                    // so in this case there would be an error shown because we were too fast (with rendering, or the req was too slow)
                    // We don't want to show an error in that case
                    return;
                }

                if (Features.pipelinesApi) {
                    toast({
                        status: 'error', duration: null, isClosable: true,
                        title: 'Failed to load pipelines',
                        description: String(err),
                    });
                }
            })
    }

    async deleteSecret(id: string) {
        await rpcnSecretManagerApi.delete(new DeleteSecretRequest({
            id
        }))
        this.refreshData(true);
    }

    render() {

        const filteredSecrets = (rpcnSecretManagerApi.secrets ?? [])
            .filter(u => {
                const filter = uiSettings.rpcnSecretList.quickSearch;
                if (!filter) return true;
                try {
                    const quickSearchRegExp = new RegExp(filter, 'i');
                    if (u.id.match(quickSearchRegExp))
                        return true;
                    return false;
                } catch {
                    return false;
                }
            });

        return (
            <PageContent>
                <Section>
                    <ToastContainer/>

                    {rpcnSecretManagerApi.secrets?.length != 0 && (
                        <Flex my={5} flexDir={'column'} gap={2}>
                            <CreateSecretButton/>
                            <SearchField width="350px"
                                         searchText={uiSettings.rpcnSecretList.quickSearch}
                                         setSearchText={x => uiSettings.rpcnSecretList.quickSearch = x}
                                         placeholderText="Enter search term / regex..."
                            />
                        </Flex>
                    )}

                    {(rpcnSecretManagerApi.secrets ?? []).length == 0
                        ? <EmptyPlaceholder/>
                        : <DataTable<Secret>
                            data={filteredSecrets}
                            pagination
                            defaultPageSize={10}
                            sorting
                            columns={[
                                {
                                    header: 'Secret name',
                                    cell: ({row: {original}}) => <Text>{original.id}</Text>,
                                    size: 200,
                                },
                                {
                                    header: 'Secret notation',
                                    cell: ({row: {original}}) => (
                                        <Box>
                                            <Code><Text wordBreak="break-word" whiteSpace="break-spaces">{`$\{secrets.${original.id}}`}</Text></Code>
                                            <Tooltip label="Copy" hasArrow>
                                                <CopyButton
                                                    content={`$\{secrets.${original.id}}`}
                                                    variant="ghost"
                                                    colorScheme="gray"
                                                    size="sm"
                                                />
                                            </Tooltip>
                                        </Box>),
                                    size: 400
                                },
                                // let use this on next phase
                                // {
                                //     header: 'Pipelines',
                                //     cell: (_) => (
                                //         <Text wordBreak="break-word" whiteSpace="break-spaces">TODO</Text>
                                //     ),
                                //     size: 400,
                                // },
                                {
                                    header: '',
                                    id: 'actions',
                                    cell: ({row: {original: r}}) =>
                                        <Flex justifyContent={'flex-end'}>
                                            <ButtonGroup>
                                                <Button variant="icon"
                                                        height="16px" color="gray.500"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            appGlobal.history.push(`/rp-connect/secret/${r.id}/edit`);
                                                        }}>
                                                    <PencilIcon/>
                                                </Button>
                                                <ConfirmItemDeleteModal
                                                    trigger={
                                                        <Button variant="icon"
                                                                height="16px"
                                                                color="gray.500"
                                                        >
                                                            <TrashIcon/>
                                                        </Button>} itemType={'Secret'}
                                                    onConfirm={
                                                        async (dismiss) => {
                                                            await this.deleteSecret(r.id)
                                                            dismiss();
                                                        }
                                                    }
                                                    inputMatchText={r.id}>
                                                    <Flex flexDirection={'column'}>
                                                        <Text>Deleting this secret may disrupt the functionality of pipelines that depend on it. Are you sure?</Text>
                                                        <Text>To confirm, type <Code>{r.id}</Code> in the confirmation box below.</Text>
                                                    </Flex>
                                                </ConfirmItemDeleteModal>

                                            </ButtonGroup>
                                        </Flex>
                                    ,
                                    size: 10
                                },
                            ]}
                            emptyText=""
                        />
                    }

                </Section>
            </PageContent>
        )
    }
}

export default RpConnectSecretsList;
