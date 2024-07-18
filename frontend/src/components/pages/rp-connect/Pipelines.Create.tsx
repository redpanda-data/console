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
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { appGlobal } from '../../../state/appGlobal';
import PageContent from '../../misc/PageContent';
import { PageComponent, PageInitHelper } from '../Page';
import { Box, Button, createStandaloneToast, Flex, FormField, Input } from '@redpanda-data/ui';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import { pipelinesApi } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { Link } from 'react-router-dom';
import Tabs from '../../misc/tabs/Tabs';
import { PipelineCreate } from '../../../protogen/redpanda/api/dataplane/v1alpha2/pipeline_pb';
const { ToastContainer, toast } = createStandaloneToast();

const exampleContent = `
input:
  label: input_chatroom_event_pubsub
  gcp_pubsub:
    project: "project-name"
    subscription: "my-sub-name"
pipeline:
  threads: -1
  processors:
    - label: log_input_message
      log:
        level: DEBUG
        message: "Received chatroom event (before filtering)"
        fields_mapping: |
          root.message_content = this
    - label: filter_invalid_event
      mapping: |
        if this.chatroomId != null &&
        this.action != null &&
        this.action != "DELETE" {
          this
        } else {
          deleted()
        }
    - label: log_filtered_input_message
      log:
        level: INFO
        message: "Received chatroom event after filtering"
        fields_mapping: |
          root.message_content = this
    - label: format_payload
      bloblang: |
        root = {
          "chatroomId": {"string": this.chatroomId},
          "chatroomType": {"string": this.chatroomType},
          "language": {"string": this.language.or("")},
          "chatroomUrl": {"string": this.chatroomUrl},
          "chatroomName": {"string": this.chatroomName},
          "action": {"string": this.action.or("")},
          "actionTime": {"long": this.actionTime.int64()},
          "source": {"string": this.source.or("")},
        }
    - label: log_formatted_message
      log:
        level: INFO
        message: "After formatting the message"
        fields_mapping: |
          root.message_content = this
    - label: encode_message_avro
      avro:
        encoding: binary
        operator: from_json
        schema_path: "file://"
    - label: encode_error_handler
      catch:
        - log:
          level: ERROR
          message: "Failed to encode message to avro. Dropping the message."
          fields_mapping: |
            root.error = error()
            root.message_content = this
        - mapping: root = if errored() { deleted() } else { this }
output:
  seed_brokers:
    - seed-abcd.redpanda.com:9092
  topic: topic-name
  client_id: my-client
  batching:
    count: 1024
    byte_size: 16384
    period: 500ms
  compression: lz4
  sasl:
    - mechanism: SCRAM-SHA256
      username: username
      password: password
  tls:
    enabled: true
logger:
  level: INFO
  format: json
  add_timestamp: true
  level_name: level
  timestamp_name: timestamp
  message_name: message
metrics:
  mapping: root = "benthos" + "_" + this
  prometheus: {}
`;

@observer
class RpConnectPipelinesCreate extends PageComponent<{}> {

    @observable fileName = '';
    @observable description = '';
    @observable editorContent = exampleContent;
    @observable isCreating = false;

    constructor(p: any) {
        super(p);
        makeObservable(this);
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
                <FormField label="Pipeline name" isInvalid={alreadyExists} errorText="Pipeline name is already in use">
                    <Flex alignItems="center" gap="2">
                        <Input
                            placeholder="Enter a config name..."
                            data-testid="pipelineName"
                            pattern="[a-zA-Z0-9_\-]+"
                            isRequired
                            value={this.fileName}
                            onChange={x => this.fileName = x.target.value}
                            width={300}
                        />
                        <span>.yaml</span>
                    </Flex>
                </FormField>
                <FormField label="Description">
                    <Input
                        data-testid="pipelineDescription"
                        value={this.description}
                        onChange={x => this.description = x.target.value}
                        width={300}
                    />
                </FormField>

                <Tabs tabs={[
                    {
                        key: 'config', title: 'Configuration',
                        content: () => <Box>
                            {/* yaml editor */}
                            <Flex height="400px" maxWidth="800px">
                                <PipelinesYamlEditor
                                    defaultPath="config.yaml"
                                    path="config.yaml"
                                    value={this.editorContent}
                                    onChange={e => {
                                        if (e)
                                            this.editorContent = e;
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

                <Flex alignItems="center" gap="4">
                    <Button variant="solid"
                        isDisabled={alreadyExists || isNameEmpty || this.isCreating}
                        loadingText="Creating..."
                        isLoading={this.isCreating}
                        onClick={this.createPipeline}
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
            limit: undefined,
            request: undefined,
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


