import { create } from '@bufbuild/protobuf';
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
import { type Pipeline, PipelineSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { type Agent, useDeleteAgentPipelinesMutation } from 'react-query/api/agent';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ResourceInUseAlert } from '../../misc/resource-in-use-alert';

const deleteAgentSchema = (agentName: string) =>
  z.object({
    confirmationText: z.string().refine((text) => text === agentName, {
      message: `Text must match "${agentName}"`,
    }),
  });

export interface DeleteAgentModalProps {
  agent?: Agent;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteAgentModal = ({ agent, isOpen, onClose }: DeleteAgentModalProps) => {
  const navigate = useNavigate();
  const { mutateAsync: deleteAgentPipelines, isPending: isDeleteAgentPipelinesPending } =
    useDeleteAgentPipelinesMutation();

  const handleClose = () => {
    onClose();
    form.reset();
  };

  const formOpts = formOptions({
    defaultValues: {
      confirmationText: '',
    },
    validators: {
      onChange: deleteAgentSchema(agent?.displayName ?? ''),
    },
    onSubmit: async () => {
      await deleteAgentPipelines({
        pipelines: agent?.pipelines?.map((pipeline) => create(PipelineSchema, { id: pipeline?.id })) ?? [],
      });
      handleClose();
      navigate('/agents');
    },
  });

  const form = useAppForm({ ...formOpts });

  return (
    <Modal size="lg" isOpen={isOpen} onClose={handleClose} onEsc={handleClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <form>
          <form.AppForm>
            <ModalHeader>Delete Agent</ModalHeader>
            <ModalBody mb={4}>
              <Stack spacing={4}>
                <Text>
                  This action will cause data loss. To confirm, type <Code>{agent?.displayName}</Code> into the
                  confirmation box below.
                </Text>
                <ResourceInUseAlert resource="agent" usedBy="pipelines" pipelines={agent?.pipelines as Pipeline[]} />

                <form.AppField name="confirmationText">
                  {(field) => (
                    <field.TextField
                      placeholder={`Type "${agent?.displayName}" to confirm`}
                      data-testid="txt-confirmation-delete"
                    />
                  )}
                </form.AppField>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Box alignSelf="end">
                <ButtonGroup isDisabled={isDeleteAgentPipelinesPending}>
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
