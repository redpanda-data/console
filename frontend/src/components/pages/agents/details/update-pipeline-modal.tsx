import { create } from '@bufbuild/protobuf';
import {
  Button,
  ButtonGroup,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { PipelineEditor } from 'components/pages/rp-connect/Pipelines.Create';
import { cpuToTasks, MAX_TASKS, MIN_TASKS, tasksToCPU } from 'components/pages/rp-connect/tasks';
import {
  Pipeline_ResourcesSchema,
  PipelineUpdateSchema,
  UpdatePipelineRequestSchema as UpdatePipelineRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { useListAgentsQuery } from 'react-query/api/agent';
import {
  useGetPipelineQuery,
  useGetPipelinesBySecretsQuery,
  useUpdatePipelineMutation,
} from 'react-query/api/pipeline';
import { z } from 'zod';

export const updatePipelineSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1, 'Name is required'),
  description: z.string(),
  resources: z.object({
    cpuShares: z
      .number()
      .min(MIN_TASKS, 'Pipeline must have at least 1 compute unit')
      .max(MAX_TASKS, 'Pipeline must have at most 90 compute units'),
  }),
  tags: z
    .array(
      z.object({
        key: z.string(),
        value: z.string(),
      }),
    )
    .optional()
    .default([])
    .refine((tags) => {
      // Only validate non-empty tags - if both key and value are empty, that's fine
      return tags.every((tag) => {
        return (tag.key === '' && tag.value === '') || (tag.key !== '' && tag.value !== '');
      });
    }, 'Both key and value must be provided for a tag'),
  configYaml: z.string(),
});

interface UpdatePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
}

export const UpdatePipelineModal = ({ isOpen, onClose, pipelineId }: UpdatePipelineModalProps) => {
  const { mutateAsync: updatePipeline, isPending: isUpdatePipelinePending } = useUpdatePipelineMutation();

  const { data: agentList } = useListAgentsQuery();
  const matchingAgentPipelines = agentList?.agents?.find((agent) =>
    agent.pipelines.find((pipeline) => pipeline?.id === pipelineId),
  )?.pipelines;
  const { data: pipelineData } = useGetPipelineQuery({ id: pipelineId });

  const { data: pipelinesBySecrets } = useGetPipelinesBySecretsQuery();

  const pipelineToUpdate = pipelineData?.response?.pipeline;
  const secretIdsUsed = pipelinesBySecrets?.response?.pipelinesForSecret.map(({ secretId }) => secretId);

  // Get existing tags from the pipeline
  const existingTags = pipelineToUpdate?.tags
    ? Object.entries(pipelineToUpdate.tags).map(([key, value]) => ({ key, value }))
    : [{ key: '', value: '' }];

  const tasks = cpuToTasks(pipelineToUpdate?.resources?.cpuShares) || MIN_TASKS;

  const handleClose = () => {
    onClose();
    form.reset();
  };

  const formOpts = formOptions({
    defaultValues: {
      id: pipelineId,
      displayName: pipelineToUpdate?.displayName,
      description: pipelineToUpdate?.description,
      resources: {
        cpuShares: tasks,
      },
      tags: existingTags.filter((tag) => !tag.key.startsWith('__redpanda_cloud')), // Internal tags are not editable and should not be shown in the form
      configYaml: pipelineToUpdate?.configYaml ?? '',
    },
    validators: {
      onChange: updatePipelineSchema,
    },
    onSubmit: async ({ value }) => {
      const tagsMap: { [key: string]: string } = pipelineToUpdate?.tags ?? {};
      for (const tag of value.tags) {
        if (tag.key && tag.value) {
          tagsMap[tag.key] = tag.value;
        }
      }

      const request = create(UpdatePipelineRequestSchemaDataPlane, {
        id: pipelineToUpdate?.id,
        pipeline: create(PipelineUpdateSchema, {
          displayName: value.displayName,
          description: value.description,
          tags: tagsMap,
          configYaml: value.configYaml,
          resources: create(Pipeline_ResourcesSchema, {
            ...pipelineToUpdate?.resources,
            cpuShares: tasksToCPU(value.resources.cpuShares) || '0',
            memoryShares: '0', // still required by API but unused
          }),
        }),
      });

      await updatePipeline({ request });
      handleClose();
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <Modal isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="6xl">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Update Pipeline</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={4}>
                <form.AppField name="id">
                  {(field) => <field.TextField label="ID" isDisabled data-testid="pipeline-id-field" />}
                </form.AppField>
                <form.AppField
                  name="displayName"
                  validators={{
                    onChange: ({ value }) =>
                      matchingAgentPipelines?.some(
                        (pipeline) =>
                          pipeline?.id !== pipelineId &&
                          pipeline?.displayName !== undefined &&
                          pipeline?.displayName === value,
                      )
                        ? { message: 'Name is already in use for another pipeline in this agent', path: 'displayName' }
                        : undefined,
                  }}
                >
                  {(field) => <field.TextField label="Name" data-testid="pipeline-name-field" />}
                </form.AppField>
                <form.AppField name="description">
                  {(field) => <field.TextField label="Description" data-testid="pipeline-description-field" />}
                </form.AppField>
                <form.AppField name="resources.cpuShares">
                  {(field) => (
                    <field.NumberField
                      label="Compute Units"
                      data-testid="pipeline-compute-units-field"
                      min={MIN_TASKS}
                      max={MAX_TASKS}
                      helperText="The number of compute units to allocate to the pipeline."
                    />
                  )}
                </form.AppField>
                <PipelineEditor
                  yaml={pipelineToUpdate?.configYaml ?? ''}
                  onChange={(x) => form.setFieldValue('configYaml', x)}
                  secrets={secretIdsUsed}
                />
                <form.AppField name="tags" mode="array">
                  {(field) => (
                    <field.KeyValueField
                      label="Tags"
                      helperText="Tags can help you to organize your pipelines."
                      data-testid="pipeline-tags-field"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <ButtonGroup isDisabled={isUpdatePipelinePending}>
                <form.SubscribeButton
                  label="Update"
                  variant="brand"
                  data-testid="update-pipeline-button"
                  loadingText="Updating"
                />
                <Button variant="ghost" data-testid="cancel-button" onClick={onClose}>
                  Cancel
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </form.AppForm>
        </form>
      </ModalContent>
    </Modal>
  );
};
