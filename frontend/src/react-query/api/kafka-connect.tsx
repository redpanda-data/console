import { useQuery } from '@tanstack/react-query';

import { config } from '../../runtime-config';
import { parseOrUnwrap } from '../../state/backend-api';
import type { KafkaConnectors } from '../../types/kafka-connect';
import { isNonEmptyString } from '../../utils/string-utils';

export const useKafkaConnectConnectorsQuery = () => {
  const { data, isLoading } = useQuery<KafkaConnectors>({
    queryKey: ['kafka-connect-connectors'],
    queryFn: async () => {
      // Add JWT Bearer token if available (same as REST and gRPC calls)
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (isNonEmptyString(config.jwt)) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }

      const response = await config.fetch(`${config.restBasePath}/kafka-connect/connectors`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch kafka connect connectors');
      }

      return parseOrUnwrap<KafkaConnectors>(response, null, { throwOnInvalidJson: true });
    },
  });
  return {
    data,
    isLoading,
  };
};
