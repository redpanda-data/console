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
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { Box, Button, createStandaloneToast, Flex, FormField, Input } from '@redpanda-data/ui';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import { pipelinesApi } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Link } from 'react-router-dom';
import { Link as ChLink } from '@redpanda-data/ui';
import Tabs from '../../misc/tabs/Tabs';
import { PipelineCreate } from '../../../protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb';
const { ToastContainer, toast } = createStandaloneToast();

const exampleContent = `
`;

@observer
class RpConnectPipelinesCreate extends PageComponent<{}> {

    @observable fileName = '';
    @observable description = '';
    @observable editorContent = exampleContent;
    @observable isCreating = false;

    constructor(p: any) {
        super(p);
        makeObservable(this, undefined, { autoBind: true });
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Create Pipeline';
        p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
        p.addBreadcrumb('Create Pipeline', '');

        this.refreshData(true);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(_force: boolean) {
        pipelinesApi.refreshPipelines(_force);
    }


    render() {
        if (!pipelinesApi.pipelines) return DefaultSkeleton;

        const alreadyExists = pipelinesApi.pipelines.any(x => x.id == this.fileName);
        const isNameEmpty = this.fileName.trim().length == 0;

        return (
            <PageContent>
                <ToastContainer />

                <Box my="2">
                    For help creating your pipeline, see our <ChLink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/" isExternal>quickstart documentation</ChLink>
                    , our <ChLink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/cookbooks/" isExternal>library of examples</ChLink>
                    , or our <ChLink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/components/catalog/" isExternal>connector catalog</ChLink>
                    .
                </Box>

                <Flex flexDirection="column">
                    <FormField label="Pipeline name" isInvalid={alreadyExists} errorText="Pipeline name is already in use">
                        <Flex alignItems="center" gap="2">
                            <Input
                                placeholder="Enter a config name..."
                                data-testid="pipelineName"
                                pattern="[a-zA-Z0-9_\-]+"
                                isRequired
                                value={this.fileName}
                                onChange={x => this.fileName = x.target.value}
                                width={500}
                            />
                        </Flex>
                    </FormField>
                    <FormField label="Description">
                        <Input
                            data-testid="pipelineDescription"
                            value={this.description}
                            onChange={x => this.description = x.target.value}
                            width={500}
                        />
                    </FormField>

                </Flex>

                <Box mt="4">
                    <PipelineEditor yaml={this.editorContent} onChange={x => this.editorContent = x} />
                </Box>

                <Flex alignItems="center" gap="4">
                    <Button variant="solid"
                        isDisabled={alreadyExists || isNameEmpty || this.isCreating}
                        loadingText="Creating..."
                        isLoading={this.isCreating}
                        onClick={action(() => this.createPipeline())}
                    >
                        Create
                    </Button>
                    <Link to="/connect-clusters">
                        <Button variant="link">Cancel</Button>
                    </Link>
                </Flex>

            </PageContent>
        );
    }

    async createPipeline() {
        this.isCreating = true;

        pipelinesApi.createPipeline(new PipelineCreate({
            configYaml: this.editorContent,
            description: this.description,
            displayName: this.fileName,
            resources: undefined,
        }))
            .then(async () => {
                toast({
                    status: 'success', duration: 4000, isClosable: false,
                    title: 'Pipeline created'
                });
                await pipelinesApi.refreshPipelines(true);
                appGlobal.history.push('/connect-clusters');
            })
            .catch(err => {
                toast({
                    status: 'error', duration: null, isClosable: true,
                    title: 'Failed to create pipeline',
                    description: String(err),
                })
            })
            .finally(() => {
                this.isCreating = false;
            });
    }
}

export default RpConnectPipelinesCreate;



const PipelineEditor = observer((p: {
    yaml: string,
    onChange: (newYaml: string) => void
}) => {

    return <Tabs tabs={[
        {
            key: 'config', title: 'Configuration',
            content: () => <Box>
                {/* yaml editor */}
                <Flex height="400px" maxWidth="800px">
                    <PipelinesYamlEditor
                        defaultPath="config.yaml"
                        path="config.yaml"
                        value={p.yaml}
                        onChange={e => {
                            if (e)
                                p.onChange(e);
                        }}
                        language="yaml"
                    />
                </Flex>
            </Box>
        },
        {
            key: 'preview', title: 'Pipeline preview',
            content: <></>,
            disabled: true
        },
    ]} />
});
