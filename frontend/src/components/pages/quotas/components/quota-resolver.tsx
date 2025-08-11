import { create } from '@bufbuild/protobuf';
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useDisclosure,
  VStack,
} from '@redpanda-data/ui';
import {
  ListQuotasRequestSchema,
  Quota_EntityType,
  Quota_ValueType,
} from 'protogen/redpanda/api/dataplane/v1/quota_pb';
import { useState } from 'react';
import { MdSearch } from 'react-icons/md';
import { formatByteRate, getEntityTypeLabel, MAX_QUOTA_PAGE_SIZE, useListQuotasQuery } from 'react-query/api/quota';

interface EffectiveQuota {
  valueType: Quota_ValueType;
  value: number;
  source: {
    entityType: Quota_EntityType;
    entityName: string;
    precedence: number;
  };
}

interface QuotaResolverProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuotaResolver = ({ isOpen, onClose }: QuotaResolverProps) => {
  const [clientId, setClientId] = useState('');
  const [resolvedQuotas, setResolvedQuotas] = useState<EffectiveQuota[]>([]);
  const [isResolving, setIsResolving] = useState(false);

  // Fetch all quotas to resolve effective quotas
  const { data: quotaList, isLoading: isQuotaListLoading } = useListQuotasQuery(
    create(ListQuotasRequestSchema, {
      pageSize: MAX_QUOTA_PAGE_SIZE,
    }),
  );

  const resolveQuotas = () => {
    if (!clientId.trim() || !quotaList?.quotas) {
      setResolvedQuotas([]);
      return;
    }

    setIsResolving(true);

    try {
      const effectiveQuotas: EffectiveQuota[] = [];

      // For each value type, find the most specific quota that applies
      [
        Quota_ValueType.PRODUCER_BYTE_RATE,
        Quota_ValueType.CONSUMER_BYTE_RATE,
        Quota_ValueType.CONTROLLER_MUTATION_RATE,
      ].forEach((valueType) => {
        let bestMatch: EffectiveQuota | null = null;
        let highestPrecedence = -1;

        quotaList.quotas.forEach((quota: any) => {
          const value = quota.values?.find((v) => v.valueType === valueType);
          if (!value) return;

          let precedence = -1;
          let matches = false;

          const entityName = quota.entity?.entityName || '';
          const entityType = quota.entity?.entityType || Quota_EntityType.UNSPECIFIED;

          // Exact match (highest precedence)
          if (entityType === Quota_EntityType.CLIENT_ID && entityName === clientId.trim()) {
            matches = true;
            precedence = 3;
          }
          // Prefix match (medium precedence)
          else if (entityType === Quota_EntityType.CLIENT_ID_PREFIX && clientId.trim().startsWith(entityName)) {
            matches = true;
            precedence = 2;
          }
          // Default match (lowest precedence)
          else if (entityType === Quota_EntityType.CLIENT_ID && entityName === '') {
            matches = true;
            precedence = 1;
          }

          if (matches && precedence > highestPrecedence) {
            highestPrecedence = precedence;
            bestMatch = {
              valueType,
              value: value.value,
              source: {
                entityType,
                entityName,
                precedence,
              },
            };
          }
        });

        if (bestMatch) {
          effectiveQuotas.push(bestMatch);
        }
      });

      setResolvedQuotas(effectiveQuotas);
    } finally {
      setIsResolving(false);
    }
  };

  const getPrecedenceLabel = (precedence: number) => {
    switch (precedence) {
      case 3:
        return { label: 'Exact Match', color: 'red' as const };
      case 2:
        return { label: 'Prefix Match', color: 'orange' as const };
      case 1:
        return { label: 'Default', color: 'blue' as const };
      default:
        return { label: 'Unknown', color: 'gray' as const };
    }
  };

  const getValueTypeDisplay = (valueType: Quota_ValueType, value: number) => {
    switch (valueType) {
      case Quota_ValueType.PRODUCER_BYTE_RATE:
        return { label: 'Producer Rate', value: formatByteRate(value) };
      case Quota_ValueType.CONSUMER_BYTE_RATE:
        return { label: 'Consumer Rate', value: formatByteRate(value) };
      case Quota_ValueType.CONTROLLER_MUTATION_RATE:
        return { label: 'Controller Rate', value: `${value}/s` };
      default:
        return { label: 'Unknown', value: value.toString() };
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Quota Resolver</ModalHeader>
        <ModalCloseButton />

        <ModalBody pb={6}>
          <Stack spacing={6}>
            <Box>
              <Text fontSize="sm" color="gray.600" mb={4}>
                Enter a client ID to see which quotas apply and their effective limits based on precedence rules.
              </Text>

              <FormControl>
                <FormLabel>Client ID</FormLabel>
                <HStack>
                  <Input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="e.g., my-service-client"
                    onKeyPress={(e) => e.key === 'Enter' && resolveQuotas()}
                  />
                  <Button
                    leftIcon={<MdSearch />}
                    onClick={resolveQuotas}
                    isLoading={isResolving || isQuotaListLoading}
                    loadingText="Resolving..."
                  >
                    Resolve
                  </Button>
                </HStack>
              </FormControl>
            </Box>

            {clientId.trim() && resolvedQuotas.length > 0 && (
              <Box>
                <Text fontWeight="semibold" mb={4}>
                  Effective Quotas for "{clientId.trim()}":
                </Text>

                <VStack align="start" spacing={4}>
                  {resolvedQuotas.map((quota, index) => {
                    const precedence = getPrecedenceLabel(quota.source.precedence);
                    const display = getValueTypeDisplay(quota.valueType, quota.value);

                    return (
                      <Box key={index} p={4} border="1px solid" borderColor="gray.200" borderRadius="md" width="100%">
                        <HStack justifyContent="space-between" mb={2}>
                          <Text fontWeight="semibold">{display.label}</Text>
                          <Badge colorScheme={precedence.color}>{precedence.label}</Badge>
                        </HStack>

                        <VStack align="start" spacing={1}>
                          <HStack>
                            <Text fontSize="sm" color="gray.600">
                              Limit:
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">
                              {display.value}
                            </Text>
                          </HStack>
                          <HStack>
                            <Text fontSize="sm" color="gray.600">
                              Source:
                            </Text>
                            <Text fontSize="sm">
                              {getEntityTypeLabel(quota.source.entityType)}
                              {quota.source.entityName ? ` "${quota.source.entityName}"` : ' (default)'}
                            </Text>
                          </HStack>
                        </VStack>
                      </Box>
                    );
                  })}
                </VStack>
              </Box>
            )}

            {clientId.trim() && resolvedQuotas.length === 0 && !isResolving && !isQuotaListLoading && (
              <Alert status="info">
                <AlertIcon />
                <VStack align="start" spacing={1}>
                  <Text fontWeight="semibold">No Quotas Found</Text>
                  <Text fontSize="sm">
                    No quotas apply to client "{clientId.trim()}". This client will have unlimited throughput.
                  </Text>
                </VStack>
              </Alert>
            )}

            <Box fontSize="sm" color="gray.600">
              <Text fontWeight="semibold" mb={2}>
                How it works:
              </Text>
              <VStack align="start" spacing={1}>
                <Text>• Exact client ID matches have highest priority</Text>
                <Text>• Client ID prefix matches have medium priority</Text>
                <Text>• Default quotas have lowest priority</Text>
                <Text>• Each quota type (Producer/Consumer/Controller) is resolved independently</Text>
              </VStack>
            </Box>
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export const QuotaResolverButton = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <Button variant="outline" onClick={onOpen} leftIcon={<MdSearch />}>
        Quota Resolver
      </Button>
      <QuotaResolver isOpen={isOpen} onClose={onClose} />
    </>
  );
};
