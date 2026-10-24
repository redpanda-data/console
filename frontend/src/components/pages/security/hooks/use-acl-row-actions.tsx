import { create } from '@bufbuild/protobuf';
import {
  ACL_Operation,
  ACL_PermissionType,
  ACL_ResourcePatternType,
  ACL_ResourceType,
  type DeleteACLsRequest,
  DeleteACLsRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/acl_pb';
import { toast } from 'sonner';

import { useDeleteAclMutation } from '../../../../react-query/api/acl';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useDeleteUserMutation, useInvalidateUsersCache, useListUsersQuery } from '../../../../react-query/api/user';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';
import { Code as CodeEl } from '../../../../utils/tsx-utils';

export type AclRowActionsContextValue = {
  users: { name: string }[];
  canDeleteUsers: boolean;
  deleteAclsForPrincipal: (principal: string, host: string) => Promise<void>;
  deleteUser: (name: string) => Promise<void>;
  invalidateUsers: () => Promise<void>;
  onFailure: (failure: { err: unknown }) => void;
};

/** Every ACL bound to this principal on this host, whatever the resource or operation. */
const allAclsFor = (principal: string, host: string): DeleteACLsRequest =>
  create(DeleteACLsRequestSchema, {
    filter: {
      principal,
      resourceType: ACL_ResourceType.ANY,
      resourceName: undefined,
      host,
      operation: ACL_Operation.ANY,
      permissionType: ACL_PermissionType.ANY,
      resourcePatternType: ACL_ResourcePatternType.ANY,
    },
  });

/**
 * What the ACL rows need to delete a principal's ACLs or its user. The queries live here, once for the
 * table: `useListUsersQuery` auto-fetches every page from an effect, so one per row would too.
 */
export function useAclRowActions(onFailure: AclRowActionsContextValue['onFailure']): AclRowActionsContextValue {
  const featureDeleteUser = useSupportedFeaturesStore((s) => s.deleteUser);
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const { data: usersData } = useListUsersQuery(undefined, {
    enabled: isRedpandaInfoSuccess && Boolean(redpandaInfo),
  });
  const { mutateAsync: deleteACLMutation } = useDeleteAclMutation();
  const { mutateAsync: deleteUserMut } = useDeleteUserMutation();
  const invalidateUsersCache = useInvalidateUsersCache();

  return {
    users: usersData?.users ?? [],
    canDeleteUsers: Boolean(featureDeleteUser),
    deleteAclsForPrincipal: async (principal, host) => {
      await deleteACLMutation(allAclsFor(principal, host));
      toast.success(
        <span>
          Deleted ACLs for <CodeEl>{principal}</CodeEl>
        </span>
      );
    },
    deleteUser: async (name) => {
      await deleteUserMut({ name });
      toast.success(
        <span>
          Deleted user <CodeEl>{name}</CodeEl>
        </span>
      );
    },
    invalidateUsers: invalidateUsersCache,
    onFailure,
  };
}
