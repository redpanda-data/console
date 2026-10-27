import type { SASLMechanism } from '../../../../protogen/redpanda/api/dataplane/v1/user_pb';
import { useGetRedpandaInfoQuery } from '../../../../react-query/api/cluster-status';
import { useListUsersQuery } from '../../../../react-query/api/user';
import { useApiStoreHook } from '../../../../state/backend-api';
import { useSupportedFeaturesStore } from '../../../../state/supported-features';

export type UserListEntry = {
  name: string;
  principalType: 'User' | 'Group';
  isScramUser: boolean;
  mechanism?: SASLMechanism;
};

/** SASL-SCRAM users of the cluster; listing them needs the Admin API. */
export function useUserListData() {
  const { data: redpandaInfo, isSuccess: isRedpandaInfoSuccess } = useGetRedpandaInfoQuery();
  const { data, isLoading, isError, error } = useListUsersQuery(undefined, {
    enabled: isRedpandaInfoSuccess && Boolean(redpandaInfo),
  });

  const users: UserListEntry[] = (data?.users ?? []).map((u) => ({
    name: u.name,
    principalType: 'User' as const,
    isScramUser: true,
    mechanism: u.mechanism,
  }));

  return { users, isLoading, error: isError ? error : null };
}

/** Why the current user can't create users, or an empty string when they can. */
export function useCreateUserDisabledReason() {
  const featureCreateUser = useSupportedFeaturesStore((s) => s.createUser);
  const canManageUsers = useApiStoreHook((s) => s.userData?.canManageUsers);

  return [
    !featureCreateUser && "Your cluster doesn't support this feature.",
    !canManageUsers && 'You need RedpandaCapability.MANAGE_REDPANDA_USERS permission.',
  ]
    .filter(Boolean)
    .join(' ');
}
