import {
  Box,
  Button,
  ButtonGroup,
  Code,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from 'components/form/form';
import { useEffect } from 'react';
import { useDeletePipelineMutationWithToast } from 'react-query/api/pipeline';
import { z } from 'zod';

const deleteAgentSchema = (agentName: string) =>
  z.object({
    confirmationText: z.string().refine((text) => text === agentName, {
      message: `Text must match "${agentName}"`,
    }),
  });

export interface DeleteAgentModalProps {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteAgentModal = ({ agentId, agentName, isOpen, onClose }: DeleteAgentModalProps) => {
  const { mutateAsync: deleteAgent, isPending: isDeleteAgentPending } = useDeletePipelineMutationWithToast();

  const formOpts = formOptions({
    defaultValues: {
      confirmationText: '',
    },
    validators: {
      onChange: deleteAgentSchema(agentName),
    },
    onSubmit: async () => {
      await deleteAgent({
        request: { id: agentId },
      });
      onClose();
    },
  });

  const form = useAppForm({ ...formOpts });

  // Reset form on modal open/close
  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [isOpen, form]);

  return (
    <Modal size="lg" isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Delete Agent</ModalHeader>
            <ModalBody mb={4}>
              <Stack spacing={4}>
                <Text>
                  This action will cause data loss. To confirm, type <Code>{agentName}</Code> into the confirmation box
                  below.
                </Text>

                <form.AppField name="confirmationText">
                  {(field) => (
                    <field.TextField
                      placeholder={`Type "${agentName}" to confirm`}
                      data-testid="txt-confirmation-delete"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Box alignSelf="end">
                <ButtonGroup isDisabled={isDeleteAgentPending}>
                  <form.SubscribeButton
                    label="Delete"
                    variant="delete"
                    data-testid="delete-agent-button"
                    id="delete-modal-btn"
                    loadingText="Deleting"
                  />
                  <Button variant="ghost" data-testid="cancel-button" onClick={onClose}>
                    Cancel
                  </Button>
                </ButtonGroup>
              </Box>
            </ModalFooter>
          </form.AppForm>
        </form>
      </ModalContent>
    </Modal>
  );
};
