import { useQuery } from '@tanstack/react-query';
import { config } from 'config';
import type { KafkaConnectors } from 'state/rest-interfaces';

export const useKafkaConnectConnectorsQuery = () => {
  const { data, isLoading } = useQuery<KafkaConnectors>({
    queryKey: ['kafka-connect-connectors'],
    queryFn: async () => {
      // Add JWT Bearer token if available (same as REST and gRPC calls)
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (config.jwt) {
        headers.Authorization = `Bearer ${config.jwt}`;
      }

      const response = await config.fetch(`${config.restBasePath}/kafka-connect/connectors`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch kafka connect connectors');
      }

      return response.json();
    },
  });
  return {
    data,
    isLoading,
  };
};
