import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { config } from 'config';
import type {
  SchemaRegistryCompatibilityMode,
  SchemaRegistryConfigResponse,
  SchemaRegistrySubject,
  SchemaRegistrySubjectDetails,
} from 'state/restInterfaces';

export const useListSchemasQuery = () => {
  return useQuery<SchemaRegistrySubject[]>({
    queryKey: ['schemaRegistry', 'subjects'],
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/schema-registry/subjects`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
        },
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

export const useSchemaModeQuery = () => {
  return useQuery<string | null>({
    queryKey: ['schemaRegistry', 'mode'],
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/schema-registry/mode`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
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
};

export const useSchemaCompatibilityQuery = () => {
  return useQuery<string | null>({
    queryKey: ['schemaRegistry', 'compatibility'],
    queryFn: async () => {
      const response = await fetch(`${config.restBasePath}/schema-registry/config`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
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
};

export const useSchemaDetailsQuery = (subjectName: string, options?: { enabled?: boolean }) => {
  return useQuery<SchemaRegistrySubjectDetails>({
    queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'],
    queryFn: async () => {
      const response = await fetch(
        `${config.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/all`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.jwt}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch schema details for ${subjectName}`);
      }

      return response.json();
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchOnMount: true,
    enabled: options?.enabled !== false,
  });
};

export const useUpdateGlobalCompatibilityMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<SchemaRegistryConfigResponse, Error, SchemaRegistryCompatibilityMode>({
    mutationFn: async (mode: SchemaRegistryCompatibilityMode) => {
      const response = await fetch(`${config.restBasePath}/schema-registry/config`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ compatibility: mode }),
      });

      if (!response.ok) {
        throw new Error('Failed to update global compatibility mode');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'compatibility'] });
    },
  });
};

export const useUpdateSubjectCompatibilityMutation = () => {
  const queryClient = useQueryClient();

  return useMutation<
    SchemaRegistryConfigResponse,
    Error,
    { subjectName: string; mode: 'DEFAULT' | SchemaRegistryCompatibilityMode }
  >({
    mutationFn: async ({ subjectName, mode }) => {
      if (mode === 'DEFAULT') {
        const response = await fetch(
          `${config.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${config.jwt}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error('Failed to reset subject compatibility mode to default');
        }

        return response.json();
      }

      const response = await fetch(`${config.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${config.jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ compatibility: mode }),
      });

      if (!response.ok) {
        throw new Error('Failed to update subject compatibility mode');
      }

      return response.json();
    },
    onSuccess: (_, { subjectName }) => {
      queryClient.invalidateQueries({ queryKey: ['schemaRegistry', 'subjects', subjectName, 'details'] });
    },
  });
};
