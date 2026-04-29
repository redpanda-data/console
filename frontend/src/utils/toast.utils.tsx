import type { ConnectError } from '@connectrpc/connect';
import { createStandaloneToast, type ToastId, type UseToastOptions } from '@redpanda-data/ui';
import {
  BadRequestSchema,
  ErrorInfoSchema,
  LocalizedMessageSchema,
  PreconditionFailureSchema,
  QuotaFailureSchema,
  ResourceInfoSchema,
} from 'protogen/google/rpc/error_details_pb';

export type ErrorHttpPayload = {
  internalCode: number;
  userMessage: string;
  reason: string;
  description?: string;
};

interface ShowToastOptions extends Partial<UseToastOptions> {
  resourceName?: string;
}

type GetToastIdProps = {
  initialId?: ToastId;
  resourceName?: string;
};

const getToastId = ({ initialId, resourceName }: GetToastIdProps) => {
  if (!resourceName) {
    return initialId;
  }

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

  if (!(toastId && toast.isActive(toastId))) {
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

function collectBadRequestDetails(error: ConnectError): string[] {
  return error
    .findDetails(BadRequestSchema)
    .flatMap((br) => br.fieldViolations.map((v) => (v.field ? `${v.field}: ${v.description}` : v.description)));
}

function collectViolationDescriptions(error: ConnectError): string[] {
  const preconditions = error.findDetails(PreconditionFailureSchema).flatMap((pf) => pf.violations);
  const quotas = error.findDetails(QuotaFailureSchema).flatMap((qf) => qf.violations);
  return [...preconditions, ...quotas].map((v) => v.description).filter(Boolean);
}

function collectResourceInfoDetails(error: ConnectError): string[] {
  return error.findDetails(ResourceInfoSchema).flatMap((ri) => {
    if (!ri.resourceName) {
      return [];
    }
    const prefix = ri.resourceType ? `${ri.resourceType} "${ri.resourceName}"` : `"${ri.resourceName}"`;
    return [ri.description ? `${prefix}: ${ri.description}` : prefix];
  });
}

/**
 * Extracts human-readable detail strings from well-known gRPC error detail types.
 */
function collectErrorDetails(error: ConnectError): string[] {
  return [
    ...collectBadRequestDetails(error),
    ...collectViolationDescriptions(error),
    ...collectResourceInfoDetails(error),
  ];
}

export function formatToastErrorMessageGRPC({ error, action, entity }: FormatToastMessageGRPCProps): string {
  const localizedText = error.findDetails(LocalizedMessageSchema).find((m) => m.message)?.message;

  const baseMessage = localizedText || error.rawMessage;
  if (!baseMessage) {
    return `Failed to ${action} ${entity}`;
  }

  let result = `Failed to ${action} ${entity}: ${baseMessage}`;

  for (const info of error.findDetails(ErrorInfoSchema)) {
    if (info.reason) {
      result += ` (reason: ${info.reason})`;
    }
  }

  const details = collectErrorDetails(error);
  if (details.length > 0) {
    result += ` \u2014 ${details.join(', ')}`;
  }

  return result;
}
