import type { LegacyApiServices } from './legacy-api-services';
import { config as appConfig } from '../runtime-config';
import type { GetApiState, SetApiState } from '../state/backend-api';
import type {
  SchemaReferencedByEntry,
  SchemaRegistryCompatibilityMode,
  SchemaRegistryCompatibilityModeWithDefault,
  SchemaRegistryConfigResponse,
  SchemaRegistryCreateSchema,
  SchemaRegistryCreateSchemaResponse,
  SchemaRegistryDeleteSubjectResponse,
  SchemaRegistryDeleteSubjectVersionResponse,
  SchemaRegistryModeResponse,
  SchemaRegistrySchemaTypesResponse,
  SchemaRegistrySubject,
  SchemaRegistrySubjectDetails,
  SchemaRegistryValidateSchemaResponse,
  SchemaVersion,
} from '../state/rest-interfaces';
import { isNonEmptyString } from '../utils/string-utils';
import { isPresent } from '../utils/type-guards';

type LegacySchemaReadActions = {
  refreshSchemaMode(): Promise<void>;
  refreshSchemaCompatibilityConfig(): Promise<void>;
  refreshSchemaSubjects(force?: boolean): void;
  refreshSchemaTypes(force?: boolean): void;
  refreshSchemaDetails(subjectName: string, force?: boolean): Promise<void>;
};

export function createLegacySchemaReadActions(
  set: SetApiState,
  _get: GetApiState,
  services: LegacyApiServices
): LegacySchemaReadActions {
  const { cachedApiRequest, parseOrUnwrap, addError } = services;
  return {
    async refreshSchemaMode() {
      const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/mode`, {
        method: 'GET',
        headers: [['Content-Type', 'application/json']],
      });
      const rq = parseOrUnwrap<SchemaRegistryModeResponse>(response, null);

      return rq
        .then((r) => {
          if (r.isConfigured === false) {
            set({ schemaOverviewIsConfigured: false, schemaMode: null });
          } else {
            set({ schemaOverviewIsConfigured: true, schemaMode: r.mode });
          }
        })
        .catch((error: unknown) => {
          set({ schemaMode: 'Unknown' });
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.warn('failed to request schema mode', error);
        });
    },
    async refreshSchemaCompatibilityConfig() {
      const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config`, {
        method: 'GET',
        headers: [['Content-Type', 'application/json']],
      });
      const rq = parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);

      return rq
        .then((r) => {
          if (r.isConfigured === false) {
            set({ schemaOverviewIsConfigured: false, schemaCompatibility: null });
          } else {
            set({ schemaOverviewIsConfigured: true, schemaCompatibility: r.compatibility });
          }
        })
        .catch(addError);
    },
    refreshSchemaSubjects(force?: boolean) {
      cachedApiRequest<SchemaRegistrySubject[]>(`${appConfig.restBasePath}/schema-registry/subjects`, force).then(
        (subjects) => {
          // could also be a "not configured" response
          if (Array.isArray(subjects)) {
            set({ schemaSubjects: subjects });
          }
        },
        addError
      );
    },
    refreshSchemaTypes(force?: boolean) {
      cachedApiRequest<SchemaRegistrySchemaTypesResponse>(
        `${appConfig.restBasePath}/schema-registry/schemas/types`,
        force
      )
        .then((types) => {
          // could also be a "not configured" response
          if (isPresent(types.schemaTypes)) {
            set({ schemaTypes: types.schemaTypes });
          }
        })
        .catch((error: unknown) => {
          set({ schemaTypes: undefined });
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.warn('failed to request schema type', error);
        });
    },
    refreshSchemaDetails(subjectName: string, force?: boolean) {
      // Always refresh all versions, otherwise we cannot know wether or not we have to refresh with 'all,
      // If we refresh with 'latest' or specific number, we'd need to keep track of what information we're missing
      const version = 'all';
      const rq = cachedApiRequest<SchemaRegistrySubjectDetails>(
        `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}`,
        force
      );

      return rq
        .then((details) => {
          set((s) => ({ schemaDetails: new Map(s.schemaDetails).set(subjectName, details) }));
        })
        .catch(addError);
    },
  };
}

type LegacySchemaReferenceActions = {
  refreshSchemaReferencedBy(subjectName: string, version: number, force?: boolean): Promise<void>;
  refreshSchemaUsagesById(schemaId: number, force?: boolean): Promise<void>;
};

export function createLegacySchemaReferenceActions(
  set: SetApiState,
  _get: GetApiState,
  services: LegacyApiServices
): LegacySchemaReferenceActions {
  const { cachedApiRequest } = services;
  return {
    refreshSchemaReferencedBy(subjectName: string, version: number, force?: boolean) {
      const rq = cachedApiRequest<SchemaReferencedByEntry[]>(
        `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/referencedby`,
        force
      );

      return rq
        .then((references) => {
          const cleanedReferences = [] as SchemaReferencedByEntry[];
          for (const ref of references) {
            if (isNonEmptyString(ref.error)) {
              // biome-ignore lint/suspicious/noConsole: intentional console usage
              console.error('error in refreshSchemaReferencedBy, reference entry has error', {
                subjectName,
                version,
                error: ref.error,
                refRaw: ref,
              });
              continue;
            }
            cleanedReferences.push(ref);
          }

          set((s) => {
            const newOuterMap = new Map(s.schemaReferencedBy);
            const existingInner = newOuterMap.get(subjectName);
            const newInnerMap = new Map<number, SchemaReferencedByEntry[]>(existingInner);
            newInnerMap.set(version, cleanedReferences);
            newOuterMap.set(subjectName, newInnerMap);
            return { schemaReferencedBy: newOuterMap };
          });
        })
        .catch(() => {
          // no op - error handled elsewhere
        });
    },
    async refreshSchemaUsagesById(schemaId: number, force?: boolean): Promise<void> {
      type SchemaNotConfiguredType = {
        isConfigured: false;
      };
      function isSchemaVersionArray(r: SchemaVersion[] | SchemaNotConfiguredType): r is SchemaVersion[] {
        return Array.isArray(r);
      }
      await cachedApiRequest<
        | SchemaVersion[]
        | {
            isConfigured: false;
          }
      >(`${appConfig.restBasePath}/schema-registry/schemas/ids/${schemaId}/versions`, force).then(
        (r) => {
          if (isSchemaVersionArray(r)) {
            set((s) => ({ schemaUsagesById: new Map(s.schemaUsagesById).set(schemaId, r) }));
          }
        },
        (error: unknown) => {
          // Currently we don't get helpful status codes (502) so we have to inspect the message
          if (error instanceof Error && error.message.includes('404') && error.message.includes('not found')) {
            // Do nothing, most likely cause is that the user has entered a value into the search box that doesn't exist
            return null;
          }
          throw error;
        }
      );
    },
  };
}

type LegacySchemaWriteActions = {
  setSchemaRegistryCompatibilityMode(mode: SchemaRegistryCompatibilityMode): Promise<SchemaRegistryConfigResponse>;
  setSchemaRegistrySubjectCompatibilityMode(
    subjectName: string,
    mode: SchemaRegistryCompatibilityModeWithDefault
  ): Promise<SchemaRegistryConfigResponse>;
  validateSchema(
    subjectName: string,
    version: number | 'latest',
    request: SchemaRegistryCreateSchema
  ): Promise<SchemaRegistryValidateSchemaResponse>;
  createSchema(subjectName: string, request: SchemaRegistryCreateSchema): Promise<SchemaRegistryCreateSchemaResponse>;
  deleteSchemaSubject(subjectName: string, permanent: boolean): Promise<SchemaRegistryDeleteSubjectResponse>;
  deleteSchemaSubjectVersion(
    subjectName: string,
    version: 'latest' | number,
    permanent: boolean
  ): Promise<SchemaRegistryDeleteSubjectVersionResponse>;
};

export function createLegacySchemaWriteActions(
  _set: SetApiState,
  _get: GetApiState,
  services: LegacyApiServices
): LegacySchemaWriteActions {
  const { parseOrUnwrap } = services;
  return {
    async setSchemaRegistryCompatibilityMode(
      mode: SchemaRegistryCompatibilityMode
    ): Promise<SchemaRegistryConfigResponse> {
      const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config`, {
        method: 'PUT',
        headers: [['Content-Type', 'application/json']],
        body: JSON.stringify({
          compatibility: mode,
        }),
      });
      return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
    },
    async setSchemaRegistrySubjectCompatibilityMode(
      subjectName: string,
      mode: SchemaRegistryCompatibilityModeWithDefault
    ): Promise<SchemaRegistryConfigResponse> {
      if (mode === 'DEFAULT') {
        const response = await appConfig.fetch(
          `${appConfig.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
          {
            method: 'DELETE',
          }
        );
        return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
      }
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`,
        {
          method: 'PUT',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify({
            compatibility: mode,
          }),
        }
      );
      return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
    },
    async validateSchema(
      subjectName: string,
      version: number | 'latest',
      request: SchemaRegistryCreateSchema
    ): Promise<SchemaRegistryValidateSchemaResponse> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/validate`,
        {
          method: 'POST',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify(request),
        }
      );
      return parseOrUnwrap<SchemaRegistryValidateSchemaResponse>(response, null);
    },
    async createSchema(
      subjectName: string,
      request: SchemaRegistryCreateSchema
    ): Promise<SchemaRegistryCreateSchemaResponse> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions`,
        {
          method: 'POST',
          headers: [['Content-Type', 'application/json']],
          body: JSON.stringify(request),
        }
      );
      return parseOrUnwrap<SchemaRegistryCreateSchemaResponse>(response, null);
    },
    async deleteSchemaSubject(subjectName: string, permanent: boolean): Promise<SchemaRegistryDeleteSubjectResponse> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}?permanent=${permanent ? 'true' : 'false'}`,
        {
          method: 'DELETE',
          headers: [['Content-Type', 'application/json']],
        }
      );
      return parseOrUnwrap<SchemaRegistryDeleteSubjectResponse>(response, null);
    },
    async deleteSchemaSubjectVersion(
      subjectName: string,
      version: 'latest' | number,
      permanent: boolean
    ): Promise<SchemaRegistryDeleteSubjectVersionResponse> {
      const response = await appConfig.fetch(
        `${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${encodeURIComponent(version)}?permanent=${permanent ? 'true' : 'false'}`,
        {
          method: 'DELETE',
          headers: [['Content-Type', 'application/json']],
        }
      );
      return parseOrUnwrap<SchemaRegistryDeleteSubjectVersionResponse>(response, null);
    },
  };
}
