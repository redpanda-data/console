import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/outline';
import { Alert, AlertIcon, Badge, Box, Collapse, HStack, Link, Text, useDisclosure, VStack } from '@redpanda-data/ui';

export const QuotaPrecedenceBanner = () => {
  const { isOpen, onToggle } = useDisclosure();

  return (
    <Alert status="info" variant="subtle">
      <AlertIcon />
      <Box flex="1">
        <HStack justifyContent="space-between" align="center">
          <Text fontWeight="semibold">Understanding Quota Precedence</Text>
          <HStack spacing={2} cursor="pointer" onClick={onToggle}>
            <Text fontSize="sm" color="blue.600">
              Learn more
            </Text>
            {isOpen ? <ChevronDownIcon width={16} height={16} /> : <ChevronRightIcon width={16} height={16} />}
          </HStack>
        </HStack>

        <Collapse in={isOpen} animateOpacity>
          <VStack align="start" spacing={4} mt={4} pt={4} borderTop="1px solid" borderColor="blue.100">
            {/* Precedence Order */}
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Precedence Order (Highest to Lowest):
              </Text>
              <VStack align="start" spacing={2}>
                <HStack>
                  <Badge colorScheme="red" variant="solid">
                    1
                  </Badge>
                  <Text fontSize="sm">
                    <strong>Exact Client ID</strong> - Specific client (e.g., "my-service")
                  </Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="orange" variant="solid">
                    2
                  </Badge>
                  <Text fontSize="sm">
                    <strong>Client ID Prefix</strong> - Pattern match (e.g., "service-*")
                  </Text>
                </HStack>
                <HStack>
                  <Badge colorScheme="blue" variant="solid">
                    3
                  </Badge>
                  <Text fontSize="sm">
                    <strong>Default Quota</strong> - Fallback for all clients
                  </Text>
                </HStack>
              </VStack>
            </Box>

            {/* Examples */}
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Examples:
              </Text>
              <VStack align="start" spacing={3} pl={4} borderLeft="2px solid" borderColor="blue.200">
                <Box>
                  <Text fontSize="sm" fontWeight="medium">
                    Client "my-service" with these quotas:
                  </Text>
                  <VStack align="start" spacing={1} pl={4}>
                    <Text fontSize="xs">• Default: 50 MB/s</Text>
                    <Text fontSize="xs">• Prefix "my-*": 100 MB/s</Text>
                    <Text fontSize="xs">• Exact "my-service": 200 MB/s</Text>
                  </VStack>
                  <Text fontSize="sm" color="green.600" fontWeight="medium">
                    → Effective limit: 200 MB/s (exact match wins)
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="medium">
                    Client "my-worker" with these quotas:
                  </Text>
                  <VStack align="start" spacing={1} pl={4}>
                    <Text fontSize="xs">• Default: 50 MB/s</Text>
                    <Text fontSize="xs">• Prefix "my-*": 100 MB/s</Text>
                  </VStack>
                  <Text fontSize="sm" color="green.600" fontWeight="medium">
                    → Effective limit: 100 MB/s (prefix match wins)
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" fontWeight="medium">
                    Client "other-service" with these quotas:
                  </Text>
                  <VStack align="start" spacing={1} pl={4}>
                    <Text fontSize="xs">• Default: 50 MB/s</Text>
                  </VStack>
                  <Text fontSize="sm" color="green.600" fontWeight="medium">
                    → Effective limit: 50 MB/s (default applies)
                  </Text>
                </Box>
              </VStack>
            </Box>

            {/* Key Points */}
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Key Points:
              </Text>
              <VStack align="start" spacing={1}>
                <Text fontSize="sm">• Each quota type (Producer/Consumer/Controller) is evaluated independently</Text>
                <Text fontSize="sm">• Use the Quota Resolver tool to check effective limits for any client</Text>
                <Text fontSize="sm">• Default quotas affect all clients without more specific rules</Text>
                <Text fontSize="sm">• Prefix quotas use pattern matching with "*" wildcard</Text>
              </VStack>
            </Box>

            {/* Documentation Link */}
            <Box>
              <Link
                href="https://docs.redpanda.com/current/manage/cluster-maintenance/manage-throughput/#client-throughput-limits"
                isExternal
                fontSize="sm"
                color="blue.600"
              >
                📚 Read the full documentation →
              </Link>
            </Box>
          </VStack>
        </Collapse>
      </Box>
    </Alert>
  );
};
