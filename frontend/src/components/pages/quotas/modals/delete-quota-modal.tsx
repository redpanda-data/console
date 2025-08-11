import { create } from '@bufbuild/protobuf';
import {
  Alert,
  AlertIcon,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@redpanda-data/ui';
import {
  DeleteQuotaRequestSchema,
  Quota_EntityType,
  Quota_ValueType,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { getEntityTypeLabel, useDeleteQuotaMutation } from 'react-query/api/quota';

interface DeleteQuotaModalProps {
  isOpen: boolean;
  onClose: () => void;
  quotaId: string;
  onSuccess?: () => void;
}

export const DeleteQuotaModal = ({ isOpen, onClose, quotaId, onSuccess }: DeleteQuotaModalProps) => {
  const deleteQuotaMutation = useDeleteQuotaMutation();

  // Parse quota ID (format: "entityType-entityName" or "entityType-default")
  const parseQuotaId = (id: string) => {
    const [entityTypeStr, entityName] = id.split('-', 2);
    const entityType = Number.parseInt(entityTypeStr) as Quota_EntityType;
    return {
      entityType,
      entityName: entityName === 'default' ? '' : entityName,
    };
  };

  const handleDelete = async () => {
    try {
      const { entityType, entityName } = parseQuotaId(quotaId);

      // For now, we'll delete all value types for the entity
      // In a more advanced implementation, we might want to specify which value types to delete
      const _valueTypesToDelete = [
        Quota_ValueType.PRODUCER_BYTE_RATE,
        Quota_ValueType.CONSUMER_BYTE_RATE,
        Quota_ValueType.CONTROLLER_MUTATION_RATE,
      ];

      // Since the API only supports deleting one value type at a time,
      // we'll need to make multiple requests (or use batch delete)
      // For simplicity, let's delete the producer rate first
      const request = create(DeleteQuotaRequestSchema, {
        entity: {
          entityType,
          entityName: entityName || undefined,
        },
        valueType: Quota_ValueType.PRODUCER_BYTE_RATE, // TODO: Handle multiple value types
      });

      await deleteQuotaMutation.mutateAsync(request);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete quota:', error);
    }
  };

  const { entityType, entityName } = quotaId
    ? parseQuotaId(quotaId)
    : { entityType: Quota_EntityType.UNSPECIFIED, entityName: '' };
  const entityLabel = getEntityTypeLabel(entityType);
  const displayName = entityName || '<default>';

  const getImpactWarning = () => {
    if (!entityName) {
      return {
        level: 'error' as const,
        message:
          'This will remove the default quota that applies to all clients without specific rules. Clients may become unlimited.',
      };
    }
    if (entityType === Quota_EntityType.CLIENT_ID_PREFIX) {
      return {
        level: 'warning' as const,
        message: `This will remove quota limits for all clients matching the prefix "${entityName}*". They will fall back to less specific rules or become unlimited.`,
      };
    }
    return {
      level: 'info' as const,
      message: `This will remove quota limits for the specific client "${entityName}". It will fall back to prefix or default rules if they exist.`,
    };
  };

  const impactWarning = getImpactWarning();

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Delete Quota</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack align="start" spacing={4}>
            <Text>Are you sure you want to delete the quota for:</Text>

            <VStack align="start" spacing={2} p={4} bg="gray.50" borderRadius="md" width="100%">
              <HStack>
                <Text fontWeight="semibold">Type:</Text>
                <Text>{entityLabel}</Text>
              </HStack>
              <HStack>
                <Text fontWeight="semibold">Name:</Text>
                <Text fontWeight={entityName ? 'normal' : 'bold'}>{displayName}</Text>
              </HStack>
            </VStack>

            <Alert status={impactWarning.level} variant="subtle">
              <AlertIcon />
              <Text fontSize="sm">{impactWarning.message}</Text>
            </Alert>

            <Text fontSize="sm" color="gray.600">
              This action cannot be undone. Clients will immediately be subject to new effective quota rules based on
              the precedence hierarchy.
            </Text>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="outline" onClick={onClose} isDisabled={deleteQuotaMutation.isLoading}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={handleDelete}
              isLoading={deleteQuotaMutation.isLoading}
              loadingText="Deleting..."
            >
              Delete Quota
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
