import { useMemo } from 'react';
import { AIGateway_State, useListAIGatewaysQuery } from 'react-query/api/ai-gateway';

export type AIGatewayStatus = {
  isDeployed: boolean;
  isLoading: boolean;
  error: Error | null;
  runningGateways: number;
};

export const useAIGatewayStatus = (): AIGatewayStatus => {
  const { data, isLoading, error } = useListAIGatewaysQuery({}, { enabled: true });

  const status = useMemo(() => {
    if (isLoading) {
      return {
        isDeployed: false,
        isLoading: true,
        error: null,
        runningGateways: 0,
      };
    }

    if (error) {
      return {
        isDeployed: false,
        isLoading: false,
        error: error as Error,
        runningGateways: 0,
      };
    }

    const runningGateways =
      data?.aiGateways?.filter((gateway) => gateway.state === AIGateway_State.RUNNING) || [];

    return {
      isDeployed: runningGateways.length > 0,
      isLoading: false,
      error: null,
      runningGateways: runningGateways.length,
    };
  }, [data, isLoading, error]);

  return status;
};
