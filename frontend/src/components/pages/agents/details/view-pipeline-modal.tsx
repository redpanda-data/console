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
import { cpuToTasks, MAX_TASKS, MIN_TASKS } from 'components/pages/rp-connect/tasks';
import { useGetPipelineQuery, useGetPipelinesBySecretsQuery } from 'react-query/api/pipeline';
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

interface ViewPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
}

export const ViewPipelineModal = ({ isOpen, onClose, pipelineId }: ViewPipelineModalProps) => {
  const { data: pipelineData } = useGetPipelineQuery({ id: pipelineId });

  const { data: pipelinesBySecrets } = useGetPipelinesBySecretsQuery();

  const pipelineToView = pipelineData?.response?.pipeline;
  const secretIdsUsed = pipelinesBySecrets?.response?.pipelinesForSecret.map(({ secretId }) => secretId);

  // Get existing tags from the pipeline
  const existingTags = pipelineToView?.tags
    ? Object.entries(pipelineToView.tags).map(([key, value]) => ({ key, value }))
    : [];

  // Internal tags are not editable and should not be shown in the form
  const existingTagsWithoutInternal = existingTags.filter((tag) => !tag.key.startsWith('__redpanda_cloud'));

  const tasks = cpuToTasks(pipelineToView?.resources?.cpuShares) || MIN_TASKS;

  const formOpts = formOptions({
    defaultValues: {
      id: pipelineId,
      displayName: pipelineToView?.displayName,
      description: pipelineToView?.description,
      resources: {
        cpuShares: tasks,
      },
      tags: existingTagsWithoutInternal,
      configYaml: pipelineToView?.configYaml ?? '',
    },
  });

  const form = useAppForm({ ...formOpts });

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="6xl">
      <ModalOverlay />
      <ModalContent>
        <form aria-disabled>
          <form.AppForm>
            <ModalHeader>Pipeline view</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={4}>
                <form.AppField name="id">
                  {(field) => <field.TextField label="ID" data-testid="pipeline-id-field" isDisabled />}
                </form.AppField>
                <form.AppField name="displayName">
                  {(field) => <field.TextField label="Name" data-testid="pipeline-name-field" isDisabled />}
                </form.AppField>
                <form.AppField name="description">
                  {(field) => (
                    <field.TextField label="Description" data-testid="pipeline-description-field" isDisabled />
                  )}
                </form.AppField>
                <form.AppField name="resources.cpuShares">
                  {(field) => (
                    <field.NumberField
                      label="Compute Units"
                      data-testid="pipeline-compute-units-field"
                      min={MIN_TASKS}
                      max={MAX_TASKS}
                      isDisabled
                    />
                  )}
                </form.AppField>
                <PipelineEditor yaml={pipelineToView?.configYaml ?? ''} secrets={secretIdsUsed} isDisabled />
                {existingTagsWithoutInternal.length > 0 && (
                  <form.AppField name="tags" mode="array">
                    {(field) => (
                      <field.KeyValueField
                        label="Tags"
                        helperText="Tags can help you to organize your pipelines."
                        data-testid="pipeline-tags-field"
                        showAddButton={false}
                        isDisabled
                      />
                    )}
                  </form.AppField>
                )}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <ButtonGroup>
                <Button variant="ghost" data-testid="cancel-button" onClick={onClose}>
                  Close
                </Button>
              </ButtonGroup>
            </ModalFooter>
          </form.AppForm>
        </form>
      </ModalContent>
    </Modal>
  );
};
