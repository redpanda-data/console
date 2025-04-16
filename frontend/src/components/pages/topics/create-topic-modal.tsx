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
  Text,
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import {
  CreateTopicRequest,
  CreateTopicRequest_Topic,
  CreateTopicRequest_Topic_Config,
} from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { useLegacyCreateTopicMutationWithToast, useLegacyListTopicsQuery } from 'react-query/api/topic';
import { z } from 'zod';

export const topicSchema = z.object({
  name: z
    .string()
    .min(1, 'Topic name is required')
    .max(255, 'Topic name must not exceed 255 characters')
    .regex(/^[a-z0-9._-]+$/, 'Topic name must only contain lowercase letters, numbers, dots, underscores, and hyphens'),
});

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: (createdTopicLabel?: string) => void;
}

export const DEFAULT_TOPIC_PARTITION_COUNT = 1;
export const DEFAULT_TOPIC_REPLICATION_FACTOR = 3;

export const CreateTopicModal = ({ isOpen, onClose }: CreateTopicModalProps) => {
  const { data: topicList } = useLegacyListTopicsQuery();

  // Topic creation mutation
  const { mutateAsync: createTopic, isPending: isCreateTopicPending } = useLegacyCreateTopicMutationWithToast();

  const formOpts = formOptions({
    defaultValues: {
      name: '',
    },
    validators: {
      onChange: topicSchema,
    },
    onSubmit: async ({ value }) => {
      const request = new CreateTopicRequest({
        topic: new CreateTopicRequest_Topic({
          name: value.name,
          partitionCount: DEFAULT_TOPIC_PARTITION_COUNT,
          replicationFactor: DEFAULT_TOPIC_REPLICATION_FACTOR,
          configs: [
            new CreateTopicRequest_Topic_Config({
              name: 'cleanup.policy',
              value: 'delete',
            }),
          ],
        }),
      });

      await createTopic(request);
      onClose(value.name);
    },
  });

  const form = useAppForm({ ...formOpts });

  const handleClose = () => {
    form.reset();
    onClose(undefined);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} onEsc={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Create new Topic</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={2}>
                <Text>Topic will be created with the default configuration that can be changed later.</Text>

                <form.AppField
                  name="name"
                  validators={{
                    onChange: ({ value }) =>
                      topicList?.topics?.some((topic) => topic?.name === value)
                        ? { message: 'Name is already in use', path: 'name' }
                        : undefined,
                  }}
                >
                  {(field) => (
                    <field.TextField label="Name" placeholder="Enter topic name" data-testid="topic-name-field" />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>

            <ModalFooter>
              <ButtonGroup isDisabled={isCreateTopicPending}>
                <form.SubscribeButton
                  label="Create"
                  variant="brand"
                  data-testid="create-topic-button"
                  loadingText="Creating"
                />

                <Button
                  variant="ghost"
                  data-testid="cancel-button"
                  onClick={() => {
                    onClose(undefined);
                  }}
                >
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
