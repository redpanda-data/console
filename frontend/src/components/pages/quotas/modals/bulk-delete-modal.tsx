import { create } from '@bufbuild/protobuf';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Text,
  VStack,
} from '@redpanda-data/ui';
import {
  BatchDeleteQuotaRequestSchema,
  Quota_EntityType,
  Quota_ValueType,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { useState } from 'react';
import { getEntityTypeLabel, useBatchDeleteQuotaMutation } from 'react-query/api/quota';

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedQuotaIds: string[];
  onSuccess?: () => void;
}

export const BulkDeleteModal = ({ isOpen, onClose, selectedQuotaIds, onSuccess }: BulkDeleteModalProps) => {
  const [deleteProgress, setDeleteProgress] = useState(0);
  const batchDeleteMutation = useBatchDeleteQuotaMutation();

  // Parse quota ID (format: "entityType-entityName" or "entityType-default")
  const parseQuotaId = (id: string) => {
    const [entityTypeStr, entityName] = id.split('-', 2);
    const entityType = Number.parseInt(entityTypeStr) as Quota_EntityType;
    return {
      entityType,
      entityName: entityName === 'default' ? '' : entityName,
    };
  };

  const handleBulkDelete = async () => {
    try {
      setDeleteProgress(0);

      const deletions = selectedQuotaIds.map((quotaId) => {
        const { entityType, entityName } = parseQuotaId(quotaId);
        return {
          entity: {
            entityType,
            entityName: entityName || undefined,
          },
          valueTypes: [
            Quota_ValueType.PRODUCER_BYTE_RATE,
            Quota_ValueType.CONSUMER_BYTE_RATE,
            Quota_ValueType.CONTROLLER_MUTATION_RATE,
          ],
        };
      });

      const request = create(BatchDeleteQuotaRequestSchema, {
        deletions,
      });

      await batchDeleteMutation.mutateAsync(request);
      setDeleteProgress(100);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to delete quotas:', error);
      setDeleteProgress(0);
    }
  };

  const getQuotaSummary = () => {
    const summary = selectedQuotaIds.reduce(
      (acc, quotaId) => {
        const { entityType } = parseQuotaId(quotaId);
        const label = getEntityTypeLabel(entityType);
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(summary)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
  };

  const hasDefaultQuotas = selectedQuotaIds.some((id) => id.includes('-default'));
  const hasPrefixQuotas = selectedQuotaIds.some((id) => {
    const { entityType } = parseQuotaId(id);
    return entityType === Quota_EntityType.CLIENT_ID_PREFIX;
  });

  const getImpactLevel = () => {
    if (hasDefaultQuotas) return 'error' as const;
    if (hasPrefixQuotas) return 'warning' as const;
    return 'info' as const;
  };

  const getImpactMessage = () => {
    if (hasDefaultQuotas && hasPrefixQuotas) {
      return 'This includes default quotas and prefix quotas. Many clients may lose their limits and become unlimited or fall back to less restrictive rules.';
    }
    if (hasDefaultQuotas) {
      return 'This includes default quotas that apply to all clients. Many clients may become unlimited after deletion.';
    }
    if (hasPrefixQuotas) {
      return 'This includes prefix quotas that apply to multiple clients. Affected clients will fall back to default quotas or become unlimited.';
    }
    return 'These are specific client quotas. Affected clients will fall back to prefix or default quotas if they exist.';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Delete Multiple Quotas</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          <VStack align="start" spacing={4}>
            <Text>
              Are you sure you want to delete <strong>{selectedQuotaIds.length}</strong> quota
              {selectedQuotaIds.length > 1 ? 's' : ''}?
            </Text>

            <Box p={4} bg="gray.50" borderRadius="md" width="100%">
              <Text fontWeight="semibold" mb={2}>
                Selection Summary:
              </Text>
              <Text>{getQuotaSummary()}</Text>
            </Box>

            {deleteProgress > 0 && (
              <Box width="100%">
                <Text fontSize="sm" mb={2}>
                  Deleting quotas...
                </Text>
                <Progress value={deleteProgress} colorScheme="red" />
              </Box>
            )}

            <Alert status={getImpactLevel()} variant="subtle">
              <AlertIcon />
              <Text fontSize="sm">{getImpactMessage()}</Text>
            </Alert>

            <Alert status="warning" variant="subtle">
              <AlertIcon />
              <VStack align="start" spacing={2}>
                <Text fontSize="sm" fontWeight="semibold">
                  Important Considerations:
                </Text>
                <VStack align="start" spacing={1} fontSize="sm">
                  <Text>• This action cannot be undone</Text>
                  <Text>• Changes take effect immediately</Text>
                  <Text>• Clients will be subject to new effective quotas based on precedence rules</Text>
                  <Text>• Some operations may fail if quotas are currently in use</Text>
                </VStack>
              </VStack>
            </Alert>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="outline" onClick={onClose} isDisabled={batchDeleteMutation.isLoading}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={handleBulkDelete}
              isLoading={batchDeleteMutation.isLoading}
              loadingText={`Deleting ${selectedQuotaIds.length} quota${selectedQuotaIds.length > 1 ? 's' : ''}...`}
            >
              Delete {selectedQuotaIds.length} Quota{selectedQuotaIds.length > 1 ? 's' : ''}
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
