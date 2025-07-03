import type { ConnectError } from '@connectrpc/connect';
import { createStandaloneToast, type ToastId, type UseToastOptions } from '@redpanda-data/ui';

export interface ErrorHttpPayload {
  internalCode: number;
  userMessage: string;
  reason: string;
  description?: string;
}

interface ShowToastOptions extends Partial<UseToastOptions> {
  resourceName?: string;
}

interface GetToastIdProps {
  initialId?: ToastId;
  resourceName?: string;
}

const getToastId = ({ initialId, resourceName }: GetToastIdProps) => {
  if (!resourceName) return initialId;

  return `${initialId}_${resourceName}`;
};

export const showToast = (options: ShowToastOptions) => {
  const { toast } = createStandaloneToast();

  const defaultToastSettings: Partial<UseToastOptions> = {
    position: 'top',
    size: 'xs',
    isClosable: true,
    duration: 5000,
  };

  const toastId = getToastId({
    initialId: options?.id,
    resourceName: options?.resourceName,
  });

  if (!toastId || !toast.isActive(toastId)) {
    toast({
      ...defaultToastSettings,
      ...options,
      duration: options.status === 'error' ? null : defaultToastSettings.duration,
    });
  }
};

type FormatToastMessageProps = {
  error: Omit<ErrorHttpPayload, 'userMessage'>;
  action: string; // verb (fetch, upgrade, delete, edit, get)
  entity: string; // noun (cluster, token, namespace, organization)
  customReason?: string;
  customCode?: number;
};

interface FormatToastMessageGRPCProps extends Omit<FormatToastMessageProps, 'error' | 'customCode'> {
  error: ConnectError;
}

export const formatToastErrorMessage = ({
  error,
  action,
  entity,
  customReason,
  customCode,
}: FormatToastMessageProps) => {
  if (error.internalCode === 0 || customCode === 0) {
    return `Failed to ${action} ${entity}`;
  }

  if (customCode) {
    return `Failed to ${action} ${entity} due to: ${customReason || error.reason} (http code: ${customCode})`;
  }

  return `Failed to ${action} ${entity} due to: ${customReason || error.reason} (code: ${error.internalCode})`;
};

export const formatToastErrorMessageGRPC = ({ error, action, entity }: FormatToastMessageGRPCProps) => {
  return `Failed to ${action} ${entity} due to: ${error.message} (code: ${error.code})`;
};
