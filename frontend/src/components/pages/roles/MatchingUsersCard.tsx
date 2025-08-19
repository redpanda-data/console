/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { createConnectQueryKey, useMutation, useQuery } from '@connectrpc/connect-query';
import { useToast } from '@redpanda-data/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/redpanda-ui/button';
import { Card, CardContent } from '@/components/redpanda-ui/card';
import {
  type ListRoleMembersRequest,
  SecurityService,
  type UpdateRoleMembershipRequest,
} from '@/protogen/redpanda/api/dataplane/v1/security_pb';
import {
  listRoleMembers,
  updateRoleMembership,
} from '@/protogen/redpanda/api/dataplane/v1/security-SecurityService_connectquery';
import type { ListUsersRequest } from '@/protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from '@/protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { AutocompleteInput } from '../acls/new-acl/AutocompleteInput';

interface MatchingUsersCardProps {
  principalType: string;
  principal: string;
}

export function MatchingUsersCard({ principalType, principal }: MatchingUsersCardProps) {
  // Extract role name from principal (format: "RedpandaRole:roleName")
  const roleName = principalType === 'RedpandaRole' ? principal.split(':')[1] : '';

  // State for adding new user
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [deletingPrincipal, setDeletingPrincipal] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  // Fetch role members if it's a RedpandaRole
  const {
    data: membersData,
    isLoading,
    refetch,
  } = useQuery(
    listRoleMembers,
    {
      roleName,
      pageSize: 100,
    } as ListRoleMembersRequest,
    {
      enabled: principalType === 'RedpandaRole' && !!roleName,
    },
  );

  // Fetch all users for the combobox
  const { data: usersData } = useQuery(
    listUsers,
    {
      pageSize: 1000, // Get as many users as possible
    } as ListUsersRequest,
    {
      enabled: isAddingUser && principalType === 'RedpandaRole',
    },
  );

  // Set up mutation for adding/removing user to/from role
  const { mutateAsync: updateMembership, isPending: isSubmitting } = useMutation(updateRoleMembership, {
    onSuccess: async (_, variables) => {
      // Invalidate and refetch the role members query
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({
          schema: SecurityService.method.listRoleMembers,
          cardinality: 'finite',
          input: { roleName },
        }),
      });
      await refetch();

      // Determine if this was an add or remove operation
      const isAddOperation = variables.add && variables.add.length > 0;

      if (isAddOperation) {
        toast({
          status: 'success',
          description: `User "${newUserName}" added to role successfully`,
        });
        // Reset add state
        setNewUserName('');
        setIsAddingUser(false);
      } else {
        toast({
          status: 'success',
          description: 'User removed from role successfully',
        });
      }

      setDeletingPrincipal(null);
    },
    onError: (error, variables) => {
      const isAddOperation = variables.add && variables.add.length > 0;
      toast({
        status: 'error',
        description: `Failed to ${isAddOperation ? 'add' : 'remove'} user: ${error.message}`,
      });
      setDeletingPrincipal(null);
    },
  });

  // Handle adding user to role
  const handleAddUser = async () => {
    if (!newUserName.trim()) {
      toast({
        status: 'error',
        description: 'Please enter a username',
      });
      return;
    }

    try {
      await updateMembership({
        roleName: roleName,
        add: [{ principal: `User:${newUserName.trim()}`, $typeName: 'redpanda.api.dataplane.v1.RoleMembership' }],
        remove: [],
        create: true,
        $typeName: 'redpanda.api.dataplane.v1.UpdateRoleMembershipRequest',
      } as UpdateRoleMembershipRequest);
    } catch (_error) {
      // Error handling is done in onError callback
    }
  };

  // Handle removing user from role
  const handleRemoveUser = async (userPrincipal: string) => {
    setDeletingPrincipal(userPrincipal);
    try {
      await updateMembership({
        roleName: roleName,
        add: [],
        remove: [{ principal: userPrincipal, $typeName: 'redpanda.api.dataplane.v1.RoleMembership' }],
        create: false,
        $typeName: 'redpanda.api.dataplane.v1.UpdateRoleMembershipRequest',
      } as UpdateRoleMembershipRequest);
    } catch (_error) {
      // Error handling is done in onError callback
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setNewUserName('');
    setIsAddingUser(false);
  };

  // Get members count
  const membersCount = principalType === 'RedpandaRole' ? membersData?.members?.length || 0 : 3;

  return (
    <div className="lg:col-span-1">
      <Card className="border-gray-200 bg-slate-100">
        <div className="px-6 pt-6 pb-4 text-lg font-normal text-gray-900 tracking-tight">
          Matching users / principals ({membersCount})
        </div>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            {/* Loading state */}
            {isLoading && principalType === 'RedpandaRole' && (
              <div className="text-sm text-gray-500 italic">Loading members...</div>
            )}

            {/* Show role members if it's a RedpandaRole */}
            {principalType === 'RedpandaRole' &&
              !isLoading &&
              (membersData?.members && membersData.members.length > 0 ? (
                membersData.members.map((member) => {
                  // Extract username from principal (format: "User:username")
                  const username = member.principal?.split(':')[1] || member.principal || '';
                  const isDeleting = deletingPrincipal === member.principal;

                  return (
                    <div
                      key={member.principal}
                      className="group flex items-center justify-between bg-white/40 border border-gray-200 rounded-lg text-sm font-normal text-gray-900 gap-2 hover:bg-white/60 transition-colors"
                      style={{ padding: '8px 10px' }}
                    >
                      <span className="flex-1 text-left">{username}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveUser(member.principal)}
                        disabled={isDeleting}
                        className="opacity-100 transition-opacity p-1 h-auto "
                        data-testid={`remove-user-${username}-button`}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-gray-500 italic">No members assigned to this role</div>
              ))}
          </div>

          {/* Add user/principal button and input - only for RedpandaRole */}
          {principalType === 'RedpandaRole' && (
            <div className="pt-2 border-t border-gray-200">
              {!isAddingUser ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-white/60"
                  onClick={() => setIsAddingUser(true)}
                  data-testid="add-user-principal-button"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add user/principal
                </Button>
              ) : (
                <div className="flex gap-2">
                  <AutocompleteInput
                    value={newUserName}
                    onChange={setNewUserName}
                    placeholder="Select or enter username..."
                    className="flex-1 text-sm"
                    suggestions={
                      usersData?.users
                        ?.filter((user) => {
                          // Filter out users already in the role
                          const userPrincipal = `User:${user.name}`;
                          return !membersData?.members?.some((member) => member.principal === userPrincipal);
                        })
                        .map((user) => user.name) || []
                    }
                    data-testid={'add-user-input'}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddUser}
                    disabled={isSubmitting || !newUserName.trim()}
                    className="px-2"
                    data-testid="confirm-add-user-button"
                  >
                    <Check className="w-4 h-4 text-green-600" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSubmitting} className="px-2">
                    <X className="w-4 h-4 text-red-600" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
