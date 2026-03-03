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
import { Button, Flex, FormField, Input, NumberInput, useToast } from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import { Link as UILink, Text as UIText } from 'components/redpanda-ui/components/typography';
import { isEmbedded, isFeatureFlagEnabled } from 'config';
import {
  type Pipeline,
  type Pipeline_ServiceAccount,
  PipelineUpdateSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useState } from 'react';

import { formatPipelineError } from './errors';
import PipelinePage from './pipeline';
import { PipelineEditor } from './pipelines-create';
import { cpuToTasks, MAX_TASKS, MIN_TASKS, tasksToCPU } from './tasks';
import { appGlobal } from '../../../state/app-global';
import { pipelinesApi, rpcnSecretManagerApi } from '../../../state/backend-api';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import { PageComponent, type PageInitHelper } from '../page';

class RpConnectPipelinesEdit extends PageComponent<{ pipelineId: string }> {
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
    if (isFeatureFlagEnabled('enableRpcnTiles') && isEmbedded()) {
      return <PipelinePage />;
    }
    if (!pipelinesApi.pipelines) {
      return DefaultSkeleton;
    }
    const pipelineId = this.props.pipelineId;
    const pipeline = pipelinesApi.pipelines.first((x) => x.id === pipelineId);
    if (!pipeline) {
      return DefaultSkeleton;
    }
    return <RpConnectPipelinesEditContent pipeline={pipeline} pipelineId={pipelineId} />;
  }
}

export default RpConnectPipelinesEdit;

const RpConnectPipelinesEditContent = ({ pipeline, pipelineId }: { pipeline: Pipeline; pipelineId: string }) => {
  const [displayName, setDisplayName] = useState(pipeline.displayName);
  const [description, setDescription] = useState(pipeline.description);
  const [tasks, setTasks] = useState(cpuToTasks(pipeline?.resources?.cpuShares) || MIN_TASKS);
  const [editorContent, setEditorContent] = useState(pipeline.configYaml);
  const [isUpdating, setIsUpdating] = useState(false);
  const [tags] = useState(pipeline.tags);
  const [serviceAccount] = useState<Pipeline_ServiceAccount | undefined>(pipeline.serviceAccount);

  const toast = useToast();

  const secrets = rpcnSecretManagerApi.secrets?.map((s) => s.id) ?? [];
  const isNameEmpty = !displayName;

  const updatePipeline = () => {
    setIsUpdating(true);

    pipelinesApi
      .updatePipeline(
        pipelineId,
        create(PipelineUpdateSchema, {
          displayName,
          configYaml: editorContent,
          description,
          resources: {
            cpuShares: tasksToCPU(tasks) || '0',
            memoryShares: '0', // still required by API but unused
          },
          tags: {
            ...tags,
          },
          serviceAccount,
        })
      )
      .then(async (r) => {
        toast({
          status: 'success',
          duration: 4000,
          isClosable: false,
          title: 'Pipeline updated',
        });

        const retUnits = cpuToTasks(r.response?.pipeline?.resources?.cpuShares);
        if (retUnits && tasks !== retUnits) {
          toast({
            status: 'warning',
            duration: 6000,
            isClosable: false,
            title: `Pipeline has been resized to use ${retUnits} compute units`,
          });
        }
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
        setIsUpdating(false);
      });
  };

  return (
    <PageContent>
      <div className="my-2">
        <UIText>
          For help editing your pipeline, see our{' '}
          <UILink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/connect-quickstart/" target="_blank">
            quickstart documentation
          </UILink>
          , our{' '}
          <UILink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/cookbooks/" target="_blank">
            library of examples
          </UILink>
          , or our{' '}
          <UILink href="https://docs.redpanda.com/redpanda-cloud/develop/connect/components/catalog/" target="_blank">
            connector catalog
          </UILink>
          .
        </UIText>
      </div>

      <FormField errorText="Name cannot be empty" isInvalid={isNameEmpty} label="Pipeline name">
        <Flex alignItems="center" gap="2">
          <Input
            data-testid="pipelineName"
            isRequired
            onChange={(x) => {
              setDisplayName(x.target.value);
            }}
            pattern="[a-zA-Z0-9_\-]+"
            placeholder="Enter a config name..."
            value={displayName}
            width={500}
          />
        </Flex>
      </FormField>
      <FormField label="Description">
        <Input
          data-testid="pipelineDescription"
          onChange={(x) => {
            setDescription(x.target.value);
          }}
          value={description}
          width={500}
        />
      </FormField>
      <FormField
        description="One compute unit is equivalent to 0.1 CPU and 400 MB of memory. This is enough to experiment with low-volume pipelines."
        label="Compute Units"
        w={500}
      >
        <NumberInput
          max={MAX_TASKS}
          maxWidth={150}
          min={MIN_TASKS}
          onChange={(e) => {
            setTasks(Number(e ?? MIN_TASKS));
          }}
          value={tasks}
        />
      </FormField>

      <div className="mt-4">
        <PipelineEditor
          onChange={(x) => {
            setEditorContent(x);
          }}
          secrets={secrets}
          yaml={editorContent}
        />
      </div>

      <Flex alignItems="center" gap="4">
        <Button
          isDisabled={isNameEmpty || isUpdating}
          isLoading={isUpdating}
          loadingText="Updating..."
          onClick={updatePipeline}
          variant="solid"
        >
          Update
        </Button>
        <Link params={{ pipelineId }} to="/rp-connect/$pipelineId">
          <Button variant="link">Cancel</Button>
        </Link>
      </Flex>
    </PageContent>
  );
};
