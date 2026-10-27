import { useListRolesQuery } from '../../../../react-query/api/security';

/** The trimmed role name, and whether a role with that name already exists. */
export function useRoleNameAvailability(roleName: string) {
  const { data: rolesData } = useListRolesQuery();
  const trimmed = roleName.trim();
  return {
    trimmed,
    alreadyExists: trimmed !== '' && (rolesData?.roles ?? []).some((r) => r.name === trimmed),
  };
}
