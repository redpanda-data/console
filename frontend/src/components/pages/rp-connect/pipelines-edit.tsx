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
import { Link } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Spinner } from 'components/redpanda-ui/components/spinner';
import { Link as UILink } from 'components/redpanda-ui/components/typography';
import {
  type Pipeline,
  type Pipeline_ServiceAccount,
  PipelineUpdateSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useState } from 'react';
import { docsLinks } from 'utils/docs-links';
import { showToast } from 'utils/toast.utils';

import { formatPipelineError } from './errors';
import { PipelineEditor } from './pipelines-create';
import { clampTasks, cpuToTasks, MAX_TASKS, MIN_TASKS, tasksToCPU } from './tasks';
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

type PipelineUpdateInput = {
  displayName: string;
  description: string;
  tasks: number;
  editorContent: string;
};

/** Saves the edits, keeping the pipeline's tags and service account, then returns to its page. */
const useUpdatePipeline = (pipeline: Pipeline, pipelineId: string) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const { tags } = pipeline;
  const [serviceAccount] = useState<Pipeline_ServiceAccount | undefined>(pipeline.serviceAccount);

  const updatePipeline = ({ displayName, description, tasks, editorContent }: PipelineUpdateInput) => {
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
        showToast({
          status: 'success',
          duration: 4000,
          title: 'Pipeline updated',
        });

        const retUnits = cpuToTasks(r.response?.pipeline?.resources?.cpuShares);
        if (retUnits && tasks !== retUnits) {
          showToast({
            status: 'info',
            duration: 6000,
            title: `Pipeline has been resized to use ${retUnits} compute units`,
          });
        }
        await pipelinesApi.refreshPipelines(true);
        appGlobal.historyPush(`/rp-connect/${pipelineId}`);
      })
      .catch((err) => {
        showToast({
          status: 'error',
          title: 'Failed to update pipeline',
          description: formatPipelineError(err),
        });
      })
      .finally(() => {
        setIsUpdating(false);
      });
  };

  return { isUpdating, updatePipeline };
};

const RpConnectPipelinesEditContent = ({ pipeline, pipelineId }: { pipeline: Pipeline; pipelineId: string }) => {
  const [formState, setFormState] = useState<PipelineUpdateInput>({
    displayName: pipeline.displayName,
    description: pipeline.description,
    tasks: cpuToTasks(pipeline?.resources?.cpuShares) || MIN_TASKS,
    editorContent: pipeline.configYaml,
  });
  const { displayName, description, tasks, editorContent } = formState;
  const setField = <K extends keyof PipelineUpdateInput>(key: K, value: PipelineUpdateInput[K]) =>
    setFormState((prev) => ({ ...prev, [key]: value }));
  // The field holds what was typed; `tasks` stays clamped.
  const [tasksDraft, setTasksDraft] = useState(String(tasks));
  const { isUpdating, updatePipeline } = useUpdatePipeline(pipeline, pipelineId);

  const secrets = rpcnSecretManagerApi.secrets?.map((s) => s.id) ?? [];
  const isNameEmpty = !displayName;

  return (
    <PageContent>
      <div className="my-2">
        <div className="text-body">
          For help editing your pipeline, see our{' '}
          <UILink href={docsLinks.cloud.connectQuickstart} rel="noopener noreferrer" target="_blank">
            quickstart documentation
          </UILink>
          , our{' '}
          <UILink href={docsLinks.cloud.connectCookbooks} rel="noopener noreferrer" target="_blank">
            library of examples
          </UILink>
          , or our{' '}
          <UILink href={docsLinks.cloud.connectComponentCatalog} rel="noopener noreferrer" target="_blank">
            connector catalog
          </UILink>
          .
        </div>
      </div>

      <Field data-invalid={isNameEmpty}>
        <FieldLabel htmlFor="pipelineName" required>
          Pipeline name
        </FieldLabel>
        <Input
          className="w-[500px]"
          id="pipelineName"
          onChange={(x) => {
            setField('displayName', x.target.value);
          }}
          pattern="[a-zA-Z0-9_\-]+"
          placeholder="Enter a config name..."
          required
          testId="pipelineName"
          value={displayName}
        />
        {isNameEmpty ? <FieldError errors={[{ message: 'Name cannot be empty' }]} /> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="pipelineDescription">Description</FieldLabel>
        <Input
          className="w-[500px]"
          id="pipelineDescription"
          onChange={(x) => {
            setField('description', x.target.value);
          }}
          testId="pipelineDescription"
          value={description}
        />
      </Field>

      <Field className="w-[500px]">
        <FieldLabel htmlFor="pipelineTasks">Compute Units</FieldLabel>
        <Input
          className="max-w-[150px]"
          id="pipelineTasks"
          max={MAX_TASKS}
          min={MIN_TASKS}
          onBlur={() => {
            setTasksDraft(String(clampTasks(tasksDraft)));
          }}
          onChange={(e) => {
            // Clamp on blur, not here: clamping per keystroke makes the field unclearable.
            setTasksDraft(e.target.value);
            setField('tasks', clampTasks(e.target.value));
          }}
          showStepControls
          type="number"
          value={tasksDraft}
        />
        <FieldDescription>
          One compute unit is equivalent to 0.1 CPU and 400 MB of memory. This is enough to experiment with low-volume
          pipelines.
        </FieldDescription>
      </Field>

      <div className="mt-4">
        <PipelineEditor
          onChange={(x) => {
            setField('editorContent', x);
          }}
          secrets={secrets}
          yaml={editorContent}
        />
      </div>

      <div className="flex items-center gap-4">
        {/* `isLoading` hides the label, so the pending text is a child. */}
        <Button disabled={isNameEmpty || isUpdating} onClick={() => updatePipeline(formState)} variant="primary">
          {isUpdating ? (
            <>
              <Spinner />
              Updating...
            </>
          ) : (
            'Update'
          )}
        </Button>
        <Link params={{ pipelineId }} search={{} as never} to="/rp-connect/$pipelineId">
          <Button variant="link">Cancel</Button>
        </Link>
      </div>
    </PageContent>
  );
};
