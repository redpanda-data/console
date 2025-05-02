import type { ConnectError } from '@connectrpc/connect';
import { type ToastId, type UseToastOptions, createStandaloneToast } from '@redpanda-data/ui';

export interface ErrorHttpPayload {
  internalCode: number;
  userMessage: string;
  reason: string;
  description?: string;
}

export const TOASTS = {
  SECRET: {
    CREATE: {
      SUCCESS: 'SECRET_CREATE_SUCCESS',
      ERROR: 'SECRET_CREATE_ERROR',
    },
    UPDATE: {
      SUCCESS: 'SECRET_UPDATE_SUCCESS',
      ERROR: 'SECRET_UPDATE_ERROR',
    },
    DELETE: {
      SUCCESS: 'SECRET_DELETE_SUCCESS',
      ERROR: 'SECRET_DELETE_ERROR',
    },
  },
  AGENT: {
    CREATE_PIPELINES: {
      SUCCESS: 'AGENT_CREATE_PIPELINES_SUCCESS',
      ERROR: 'AGENT_CREATE_PIPELINES_ERROR',
    },
    DELETE_PIPELINES: {
      SUCCESS: 'AGENT_DELETE_PIPELINES_SUCCESS',
      ERROR: 'AGENT_DELETE_PIPELINES_ERROR',
    },
  },
  PIPELINE: {
    CREATE: {
      SUCCESS: 'PIPELINE_CREATE_SUCCESS',
      ERROR: 'PIPELINE_CREATE_ERROR',
    },
    UPDATE: {
      SUCCESS: 'PIPELINE_UPDATE_SUCCESS',
      ERROR: 'PIPELINE_UPDATE_ERROR',
    },
    START: {
      SUCCESS: 'PIPELINE_START_SUCCESS',
      ERROR: 'PIPELINE_START_ERROR',
    },
    STOP: {
      SUCCESS: 'PIPELINE_STOP_SUCCESS',
      ERROR: 'PIPELINE_STOP_ERROR',
    },
    DELETE: {
      SUCCESS: 'PIPELINE_DELETE_SUCCESS',
      ERROR: 'PIPELINE_DELETE_ERROR',
    },
  },
  TOPIC: {
    CREATE: {
      SUCCESS: 'TOPIC_CREATE_SUCCESS',
      ERROR: 'TOPIC_CREATE_ERROR',
    },
  },
  USER: {
    CREATE: {
      SUCCESS: 'USER_CREATE_SUCCESS',
      ERROR: 'USER_CREATE_ERROR',
    },
  },
  ACL: {
    CREATE: {
      SUCCESS: 'ACL_CREATE_SUCCESS',
      ERROR: 'ACL_CREATE_ERROR',
    },
  },
  REDPANDA_CONNECT: {
    LINT_CONFIG: {
      SUCCESS: 'REDPANDA_CONNECT_LINT_CONFIG_SUCCESS',
      ERROR: 'REDPANDA_CONNECT_LINT_CONFIG_ERROR',
    },
  },
  TRANSFORM: {
    DELETE: {
      SUCCESS: 'TRANSFORM_DELETE_SUCCESS',
      ERROR: 'TRANSFORM_DELETE_ERROR',
    },
  },
};

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
