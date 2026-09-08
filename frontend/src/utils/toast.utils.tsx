import type { ConnectError } from '@connectrpc/connect';
import { toast } from 'components/redpanda-ui/components/toast';
import {
  BadRequestSchema,
  ErrorInfoSchema,
  LocalizedMessageSchema,
  PreconditionFailureSchema,
  QuotaFailureSchema,
  ResourceInfoSchema,
} from 'protogen/google/rpc/error_details_pb';
import type { ReactNode } from 'react';

export type ErrorHttpPayload = {
  internalCode: number;
  userMessage: string;
  reason: string;
  description?: string;
};

export type ToastStatus = 'success' | 'error' | 'warning' | 'info' | 'loading';

export type ShowToastOptions = {
  /** Showing a toast whose id is already on screen updates it in place. */
  id?: string;
  /** Suffixed onto `id`, so one id can be live once per resource. */
  resourceName?: string;
  status?: ToastStatus;
  title?: ReactNode;
  description?: ReactNode;
  /** Milliseconds until auto-dismiss; `null` keeps the toast until closed. Errors default to `null`. */
  duration?: number | null;
  /** Fires when the user closes the toast or it times out. */
  onClose?: () => void;
};

export type UpdateToastOptions = Omit<ShowToastOptions, 'id' | 'resourceName'>;

const DEFAULT_TOAST_DURATION = 5000;

type GetToastIdProps = {
  initialId?: string;
  resourceName?: string;
};

const getToastId = ({ initialId, resourceName }: GetToastIdProps) => {
  if (!resourceName) {
    return initialId;
  }

  return initialId ? `${initialId}_${resourceName}` : resourceName;
};

// Base UI: timeout 0 means sticky, and a `loading` toast never times out.
const toTimeout = (status: ToastStatus | undefined, duration: number | null | undefined): number => {
  if (duration === null) {
    return 0;
  }
  if (duration !== undefined) {
    return duration;
  }
  return status === 'error' ? 0 : DEFAULT_TOAST_DURATION;
};

/** Returns the toast id, for `updateToast` / `closeToast`. */
export const showToast = ({
  id,
  resourceName,
  status,
  title,
  description,
  duration,
  onClose,
}: ShowToastOptions): string =>
  toast.add({
    id: getToastId({ initialId: id, resourceName }),
    type: status,
    title,
    description,
    timeout: toTimeout(status, duration),
    onClose,
  });

/** Only the fields given change. A new status re-applies its dismiss default unless `duration` is given. */
export const updateToast = (id: string, { status, title, description, duration }: UpdateToastOptions) => {
  const timeout = status !== undefined || duration !== undefined ? toTimeout(status, duration) : undefined;
  toast.update(id, {
    ...(status !== undefined && { type: status }),
    ...(timeout !== undefined && { timeout }),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
  });
};

// Base UI closes every toast when the id is missing.
export const closeToast = (id: string) => {
  if (id) {
    toast.close(id);
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
