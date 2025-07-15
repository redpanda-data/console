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

import { create } from '@bufbuild/protobuf';
import {
  Box,
  Button,
  Link as ChLink,
  createStandaloneToast,
  Flex,
  FormField,
  Input,
  NumberInput,
} from '@redpanda-data/ui';
import { action, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { PipelineUpdateSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { Link } from 'react-router-dom';
import { appGlobal } from '../../../state/appGlobal';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backendApi';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { PageComponent, type PageInitHelper } from '../Page';
import { formatPipelineError } from './errors';
import { PipelineEditor } from './Pipelines.Create';
import { cpuToTasks, MAX_TASKS, MIN_TASKS, tasksToCPU } from './tasks';

const { ToastContainer, toast } = createStandaloneToast();

@observer
class RpConnectPipelinesEdit extends PageComponent<{ pipelineId: string }> {
  @observable displayName = undefined as unknown as string;
  @observable description = undefined as unknown as string;
  @observable tasks = undefined as unknown as number;
  @observable editorContent = undefined as unknown as string;
  @observable isUpdating = false;
  @observable secrets: string[] = [];
  // TODO: Actually show this within the pipeline edit page
  @observable tags = {} as Record<string, string>;

  constructor(p: any) {
    super(p);
    makeObservable(this, undefined, { autoBind: true });
  }

  initPage(p: PageInitHelper): void {
    const pipelineId = this.props.pipelineId;

    p.title = 'Edit Pipeline';
    p.addBreadcrumb('Redpanda Connect', '/connect-clusters');
    p.addBreadcrumb('Edit Pipeline', `/rp-connect/${pipelineId}/edit`);

    this.refreshData(true);
    // get secrets
    rpcnSecretManagerApi.refreshSecrets(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(_force: boolean) {
    pipelinesApi.refreshPipelines(_force);
  }

  render() {
    if (!pipelinesApi.pipelines) return DefaultSkeleton;
    if (rpcnSecretManagerApi.secrets) {
      // inject secrets to editor
      this.secrets.updateWith(rpcnSecretManagerApi.secrets.map((value) => value.id));
    }
    const pipelineId = this.props.pipelineId;
    const pipeline = pipelinesApi.pipelines.first((x) => x.id === pipelineId);
    if (!pipeline) return DefaultSkeleton;

    if (this.displayName === undefined) {
      this.displayName = pipeline.displayName;
      this.description = pipeline.description;
      this.tasks = cpuToTasks(pipeline?.resources?.cpuShares) || MIN_TASKS;
      this.editorContent = pipeline.configYaml;
      this.tags = pipeline.tags;
    }

    const isNameEmpty = !this.displayName;

    return (
      <PageContent>
        <ToastContainer />

        <Box my="2">
          For help creating your pipeline, see our{' '}
          <ChLink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/" isExternal>
            quickstart documentation
          </ChLink>
          , our{' '}
          <ChLink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/cookbooks/" isExternal>
            library of examples
          </ChLink>
          , or our{' '}
          <ChLink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/components/catalog/" isExternal>
            connector catalog
          </ChLink>
          .
        </Box>

        <FormField label="Pipeline name" isInvalid={isNameEmpty} errorText="Name cannot be empty">
          <Flex alignItems="center" gap="2">
            <Input
              placeholder="Enter a config name..."
              data-testid="pipelineName"
              pattern="[a-zA-Z0-9_\-]+"
              isRequired
              value={this.displayName}
              onChange={(x) => (this.displayName = x.target.value)}
              width={500}
            />
          </Flex>
        </FormField>
        <FormField label="Description">
          <Input
            data-testid="pipelineDescription"
            value={this.description}
            onChange={(x) => (this.description = x.target.value)}
            width={500}
          />
        </FormField>
        <FormField label="Compute Units">
          <NumberInput
            value={this.tasks}
            onChange={(e) => (this.tasks = Number(e ?? MIN_TASKS))}
            min={MIN_TASKS}
            max={MAX_TASKS}
            maxWidth={150}
          />
        </FormField>

        <Box mt="4">
          <PipelineEditor yaml={this.editorContent} onChange={(x) => (this.editorContent = x)} secrets={this.secrets} />
        </Box>

        <Flex alignItems="center" gap="4">
          <Button
            variant="solid"
            isDisabled={isNameEmpty || this.isUpdating}
            loadingText="Updating..."
            isLoading={this.isUpdating}
            onClick={action(() => this.updatePipeline())}
          >
            Update
          </Button>
          <Link to={`/rp-connect/${pipelineId}`}>
            <Button variant="link">Cancel</Button>
          </Link>
        </Flex>
      </PageContent>
    );
  }

  async updatePipeline() {
    this.isUpdating = true;
    const pipelineId = this.props.pipelineId;

    pipelinesApi
      .updatePipeline(
        pipelineId,
        create(PipelineUpdateSchema, {
          displayName: this.displayName,
          configYaml: this.editorContent,
          description: this.description,
          resources: {
            cpuShares: tasksToCPU(this.tasks) || '0',
            memoryShares: '0', // still required by API but unused
          },
          tags: {
            ...this.tags,
          },
        }),
      )
      .then(async () => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: 'Pipeline updated',
        });
        await pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(`/rp-connect/${pipelineId}`);
      })
      .catch((err) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to update pipeline',
          description: formatPipelineError(err),
        });
      })
      .finally(() => {
        this.isUpdating = false;
      });
  }
}

export default RpConnectPipelinesEdit;
