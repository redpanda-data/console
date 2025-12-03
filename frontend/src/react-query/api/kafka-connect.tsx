import { useQuery } from '@tanstack/react-query';
import { config } from 'config';
import type { KafkaConnectors } from 'state/rest-interfaces';

export const useKafkaConnectConnectorsQuery = () => {
  const { data, isLoading } = useQuery<KafkaConnectors>({
    queryKey: ['kafka-connect-connectors'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/kafka-connect/connectors`, {
        method: 'GET',
        headers: [['Content-Type', 'application/json']],
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
