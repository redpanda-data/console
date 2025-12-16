import { ConnectError } from '@connectrpc/connect';
import {
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from '@tanstack/react-query';
import { config } from 'config';
import type {
  SchemaRegistryCompatibilityMode,
  SchemaRegistryConfigResponse,
  SchemaRegistrySubject,
  SchemaRegistrySubjectDetails,
  SchemaVersion,
} from 'state/rest-interfaces';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';

// Stale time constants for consistent cache behavior
// const STALE_TIME_SHORT = 10_000; // 10 seconds
const STALE_TIME_MEDIUM = 30_000; // 30 seconds
// const STALE_TIME_LONG = 60_000; // 60 seconds

export const useListSchemasQuery = () => {
  return useTanstackQuery<SchemaRegistrySubject[]>({
    queryKey: ['schemaRegistry', 'subjects'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/schema-registry/subjects`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schema subjects');
      }

      const data = await response.json();
      // could also be a "not configured" response
      if (!Array.isArray(data)) {
        return [];
      }

      return data;
    },
    refetchOnMount: true,
  });
};

export const useSchemaModeQuery = () =>
  useTanstackQuery<string | null>({
    queryKey: ['schemaRegistry', 'mode'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/schema-registry/mode`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schema mode');
      }

      const data = await response.json();
      if (data.isConfigured === false) {
        return null;
      }

      return data.mode ?? null;
    },
    refetchOnMount: true,
  });

export const useSchemaCompatibilityQuery = () =>
  useTanstackQuery<string | null>({
    queryKey: ['schemaRegistry', 'compatibility'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/schema-registry/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schema compatibility');
      }

      const data = await response.json();
      if (data.isConfigured === false) {
        return null;
      }

      return data.compatibility ?? null;
    },
    refetchOnMount: true,
  });

export const useSchemaDetailsQuery = (subjectName?: string, options?: { enabled?: boolean }) =>
  useTanstackQuery<SchemaRegistrySubjectDetails>({
    queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
    queryFn: async () => {
      const response = await fetch(
        `${config.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName ?? '')}/versions/all`,
        {
          method: 'GET',
          headers: {},
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch schema details for ${subjectName}`);
      }

      return response.json();
    },
    staleTime: STALE_TIME_MEDIUM,
    refetchOnMount: true,
    enabled: options?.enabled !== false && subjectName !== '',
  });

export const useUpdateGlobalCompatibilityMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation<SchemaRegistryConfigResponse, Error, SchemaRegistryCompatibilityMode>({
    mutationFn: async (mode: SchemaRegistryCompatibilityMode) => {
      const response = await config.fetch(`${config.restBasePath}/schema-registry/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ compatibility: mode }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update global compatibility mode');
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'compatibility'], exact: false });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'update',
        entity: 'global compatibility mode',
      });
    },
  });
};

export const useUpdateSubjectCompatibilityMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation<
    SchemaRegistryConfigResponse,
    Error,
    { subjectName: string; mode: 'DEFAULT' | SchemaRegistryCompatibilityMode }
  >({
    mutationFn: async ({ subjectName, mode }) => {
      if (mode === 'DEFAULT') {
        const response = await config.fetch(
          `${config.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
          {
            method: 'DELETE',
            headers: {},
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Failed to reset subject compatibility mode to default');
        }

        return response.json();
      }

      const response = await config.fetch(
        `${config.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ compatibility: mode }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update subject compatibility mode');
      }

      return response.json();
    },
    onSuccess: async (_, { subjectName }) => {
      await queryClient.invalidateQueries({
        queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
        exact: false,
      });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'update',
        entity: 'subject compatibility mode',
      });
    },
  });
};

export const useDeleteSchemaSubjectMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation<void, Error, { subjectName: string; permanent: boolean }>({
    mutationFn: async ({ subjectName, permanent }) => {
      const { api } = await import('state/backend-api');
      await api.deleteSchemaSubject(subjectName, permanent);
    },
    onSuccess: async () => {
      // Only invalidate subjects list, not mode/compatibility
      await queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'subjects'], exact: false });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'delete',
        entity: 'schema subject',
      });
    },
  });
};

export const useSchemaTypesQuery = () =>
  useTanstackQuery<string[]>({
    queryKey: ['schemaRegistry', 'types'],
    queryFn: async () => {
      const response = await config.fetch(`${config.restBasePath}/schema-registry/schemas/types`, {
        method: 'GET',
        headers: {},
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schema types');
      }

      const data = await response.json();
      if (data.schemaTypes) {
        return data.schemaTypes;
      }

      return [];
    },
    refetchOnMount: true,
  });

export const useCreateSchemaMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation<
    { id: number },
    Error,
    {
      subjectName: string;
      schemaType: string;
      schema: string;
      references: { name: string; subject: string; version: number }[];
    }
  >({
    mutationFn: async ({ subjectName, schemaType, schema, references }) => {
      const response = await fetch(
        `${config.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            schemaType,
            schema,
            references,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create schema');
      }

      return response.json();
    },
    onSuccess: async (_, { subjectName }) => {
      await queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'subjects'], exact: false });
      await queryClient.invalidateQueries({
        queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
        exact: false,
      });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'create',
        entity: 'schema',
      });
    },
  });
};

export const useValidateSchemaMutation = () =>
  useTanstackMutation<
    {
      isValid: boolean;
      parsingError?: string;
      compatibility: { isCompatible: boolean };
    },
    Error,
    {
      subjectName: string;
      version: string | number;
      schemaType: string;
      schema: string;
      references: { name: string; subject: string; version: number }[];
    }
  >({
    mutationFn: async ({ subjectName, version, schemaType, schema, references }) => {
      const response = await fetch(
        `${config.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/validate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            schemaType,
            schema,
            references,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return {
          compatibility: { isCompatible: false },
          isValid: false,
          parsingError: error,
        };
      }

      return response.json();
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'validate',
        entity: 'schema',
      });
    },
  });

export const useSchemaReferencedByQuery = (subjectName: string, version: number, options?: { enabled?: boolean }) => {
  return useTanstackQuery<{ schemaId: number; error?: string; usages: { subject: string; version: number }[] }[]>({
    queryKey: ['schemaRegistry', 'subjects', subjectName, 'versions', version, 'referencedby'],
    queryFn: async () => {
      const response = await config.fetch(
        `${config.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/referencedby`,
        {
          method: 'GET',
          headers: {},
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch schema references for ${subjectName} version ${version}`);
      }

      const data = await response.json();

      // Filter out entries with errors
      return data.filter((ref: { error?: string }) => {
        if (ref.error) {
          return false;
        }
        return true;
      });
    },
    staleTime: STALE_TIME_MEDIUM,
    refetchOnMount: true,
    enabled: options?.enabled !== false,
  });
};

export const useDeleteSchemaVersionMutation = () => {
  const queryClient = useQueryClient();

  return useTanstackMutation<void, Error, { subjectName: string; version: 'latest' | number; permanent: boolean }>({
    mutationFn: async ({ subjectName, version, permanent }) => {
      const response = await fetch(
        `${config.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${encodeURIComponent(version)}?permanent=${permanent ? 'true' : 'false'}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete schema version');
      }
    },
    onSuccess: async (_, { subjectName }) => {
      await queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'subjects'], exact: false });
      await queryClient.invalidateQueries({
        queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
        exact: false,
      });
    },
    onError: (error) => {
      const connectError = ConnectError.from(error);
      return formatToastErrorMessageGRPC({
        error: connectError,
        action: 'delete',
        entity: 'schema version',
      });
    },
  });
};

export const useSchemaUsagesByIdQuery = (schemaId: number | null) => {
  return useTanstackQuery<SchemaVersion[]>({
    queryKey: ['schemaRegistry', 'schemas', 'ids', schemaId, 'versions'],
    queryFn: async () => {
      if (schemaId === null) {
        return [];
      }

      const response = await config.fetch(`${config.restBasePath}/schema-registry/schemas/ids/${schemaId}/versions`, {
        method: 'GET',
        headers: {},
      });

      if (!response.ok) {
        // 404 means the schema ID doesn't exist, return empty array
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Failed to fetch schema usages for schema ID ${schemaId}`);
      }

      const data = await response.json();

      // Handle "not configured" response
      if (!Array.isArray(data)) {
        return [];
      }

      return data;
    },
    staleTime: STALE_TIME_MEDIUM,
    enabled: schemaId !== null,
  });
};
