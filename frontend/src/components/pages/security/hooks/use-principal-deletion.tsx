import { create } from '@bufbuild/protobuf';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { toast } from 'sonner';

import type { PrincipalPermissionGroup } from './use-principal-permissions';
import { useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useDeleteUserMutation, useInvalidateUsersCache } from '../../../../react-query/api/user';
import { api } from '../../../../state/backend-api';
import { AclRequestDefault } from '../../../../state/rest-interfaces';
import { Code as CodeEl } from '../../../../utils/tsx-utils';

const reportFailure = async (action: () => Promise<void>, onError: (err: unknown) => void) => {
  try {
    await action();
  } catch (err: unknown) {
    onError(err);
  }
};

/**
 * Deletes a principal's direct ACLs, its SASL-SCRAM user, or both, then refreshes ACLs and users.
 * Each failed step goes to `onError`; the other step still runs.
 */
export function usePrincipalDeletion(onError: (err: unknown) => void) {
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMutation } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  const deleteAcls = async ({ principalName, principalType }: PrincipalPermissionGroup) => {
    await deleteACLMutation(
      create(DeleteACLsRequestSchema, {
        filter: {
          principal: `${principalType}:${principalName}`,
          resourceType: ACL_ResourceType.ANY,
          resourceName: undefined,
          host: undefined,
          operation: ACL_Operation.ANY,
          permissionType: ACL_PermissionType.ANY,
          resourcePatternType: ACL_ResourcePatternType.ANY,
        },
      })
    );
    toast.success(
      <span>
        Deleted ACLs for <CodeEl>{principalName}</CodeEl>
      </span>
    );
  };

  const deleteUser = async ({ principalName }: PrincipalPermissionGroup) => {
    await deleteUserMutation({ name: principalName });
    toast.success(
      <span>
        Deleted user <CodeEl>{principalName}</CodeEl>
      </span>
    );
  };

  return async (group: PrincipalPermissionGroup, shouldDeleteUser: boolean, shouldDeleteAcls: boolean) => {
    if (shouldDeleteAcls) {
      await reportFailure(() => deleteAcls(group), onError);
    }
    if (shouldDeleteUser) {
      await reportFailure(() => deleteUser(group), onError);
    }
    await Promise.allSettled([api.refreshAcls(AclRequestDefault, true), invalidateUsersCache()]);
  };
}
