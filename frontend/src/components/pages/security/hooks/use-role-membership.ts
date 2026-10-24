import { create } from '@bufbuild/protobuf';
import {
  ListRoleMembersRequestSchema,
  UpdateRoleMembershipRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { ListUsersRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useState } from 'react';
import { toast } from 'sonner';

import { useListRoleMembersQuery, useUpdateRoleMembershipMutation } from '../../../../react-query/api/security';
import { useListUsersQuery } from '../../../../react-query/api/user';
import { parsePrincipal } from '../shared/acl-model';

/** Members of a role split by principal type, with add and remove. Failures are toasted by the mutation. */
export function useRoleMembership(roleName: string) {
  const [deletingPrincipal, setDeletingPrincipal] = useState<string | null>(null);
  const { data: membersData, isLoading } = useListRoleMembersQuery(create(ListRoleMembersRequestSchema, { roleName }));
  const { mutateAsync: updateMembership, isPending: isSubmitting } = useUpdateRoleMembershipMutation();
  const members = membersData?.members ?? [];

  /** Resolves to whether the principal was added. */
  const addMember = async (principalType: 'User' | 'Group', name: string) => {
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [{ principal: `${principalType}:${name.trim()}` }],
          remove: [],
          create: true,
        })
      );
    } catch {
      return false; // Error handling is done in onError callback
    }
    toast.success(`${principalType} "${name}" added to role`);
    return true;
  };

  const removeMember = async (memberPrincipal: string) => {
    setDeletingPrincipal(memberPrincipal);
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [],
          remove: [{ principal: memberPrincipal }],
          create: false,
        })
      );
      toast.success('Member removed from role');
      setDeletingPrincipal(null);
    } catch {
      // Error handling is done in onError callback
    }
  };

  return {
    members,
    userMembers: members.filter((m) => parsePrincipal(m.principal).type === 'User'),
    groupMembers: members.filter((m) => parsePrincipal(m.principal).type === 'Group'),
    isLoading,
    isSubmitting,
    deletingPrincipal,
    addMember,
    removeMember,
  };
}

/** Names of the SASL-SCRAM users that are not members yet, offered when adding one. */
export function useNonMemberUserNames(members: { principal: string }[]) {
  const { data: usersData } = useListUsersQuery(create(ListUsersRequestSchema));
  return (
    usersData?.users
      ?.filter((user) => !members.some((member) => member.principal === `User:${user.name}`))
      .map((user) => user.name) || []
  );
}
