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

import { create } from '@bufbuild/protobuf';
import { useToast } from '@redpanda-data/ui';
import { parsePrincipal } from 'components/pages/acls/new-acl/acl.model';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { Check, Plus, Trash2, X } from 'lucide-react';
import {
  ListRoleMembersRequestSchema,
  UpdateRoleMembershipRequestSchema,
} from 'protogen/redpanda/api/dataplane/v1/security_pb';
import { ListUsersRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useState } from 'react';

import { useListRoleMembersQuery, useUpdateRoleMembershipMutation } from '../../../react-query/api/security';
import { useListUsersQuery } from '../../../react-query/api/user';
import { AutocompleteInput } from '../acls/new-acl/autocomplete-input';

type MatchingUsersCardProps = {
  principalType: string;
  principal: string;
};

export function MatchingUsersCard({ principalType, principal }: MatchingUsersCardProps) {
  // Extract role name from principal (format: "RedpandaRole:roleName")
  const roleName = principalType === 'RedpandaRole' ? parsePrincipal(principal).name : '';

  // State for adding new user
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [deletingPrincipal, setDeletingPrincipal] = useState<string | null>(null);

  const toast = useToast();

  // Fetch role members if it's a RedpandaRole
  const { data: membersData, isLoading } = useListRoleMembersQuery(
    create(ListRoleMembersRequestSchema, {
      roleName,
    })
  );

  // Fetch all users for the combobox
  const { data: usersData } = useListUsersQuery(create(ListUsersRequestSchema));

  const { mutateAsync: updateMembership, isPending: isSubmitting } = useUpdateRoleMembershipMutation();

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
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [{ principal: `User:${newUserName.trim()}` }],
          remove: [],
          create: true,
        })
      );
      toast({
        status: 'success',
        description: `User "${newUserName}" added to role successfully`,
      });
      // Reset add state
      setNewUserName('');
      setIsAddingUser(false);
    } catch (_error) {
      // Error handling is done in onError callback
    }
  };

  // Handle removing user from role
  const handleRemoveUser = async (userPrincipal: string) => {
    setDeletingPrincipal(userPrincipal);
    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [],
          remove: [{ principal: userPrincipal }],
          create: false,
        })
      );

      toast({
        status: 'success',
        description: 'User removed from role successfully',
      });
      setDeletingPrincipal(null);
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
      <Card className="bg-slate-100" size="full">
        <CardHeader>
          <h3>Matching users / principals ({membersCount})</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            {/* Loading state */}
            {isLoading && principalType === 'RedpandaRole' && (
              <div className="text-gray-500 text-sm italic">Loading members...</div>
            )}

            {/* Show role members if it's a RedpandaRole */}
            {principalType === 'RedpandaRole' &&
              !isLoading &&
              (membersData?.members && membersData.members.length > 0 ? (
                membersData.members.map((member) => {
                  // Extract username from principal (format: "User:username")
                  const username = member.principal ? parsePrincipal(member.principal).name || member.principal : '';
                  const isDeleting = deletingPrincipal === member.principal;

                  return (
                    <div
                      className="group flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/40 font-normal text-gray-900 text-sm transition-colors hover:bg-white/60"
                      key={member.principal}
                      style={{ padding: '8px 10px' }}
                    >
                      <span className="flex-1 text-left">{username}</span>
                      <Button
                        className="h-auto p-1 opacity-100 transition-opacity"
                        data-testid={`remove-user-${username}-button`}
                        disabled={isDeleting}
                        onClick={() => handleRemoveUser(member.principal)}
                        size="sm"
                        variant="destructive-ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })
              ) : (
                <div className="text-gray-500 text-sm italic">No members assigned to this role</div>
              ))}
          </div>

          {/* Add user/principal button and input - only for RedpandaRole */}
          {principalType === 'RedpandaRole' && (
            <div className="border-gray-200 border-t pt-2">
              {isAddingUser ? (
                <div className="flex gap-2">
                  <AutocompleteInput
                    className="flex-1 text-sm"
                    data-testid={'add-user-input'}
                    onChange={setNewUserName}
                    placeholder="Select or enter username..."
                    suggestions={
                      usersData?.users
                        ?.filter((user) => {
                          // Filter out users already in the role
                          const userPrincipal = `User:${user.name}`;
                          return !membersData?.members?.some((member) => member.principal === userPrincipal);
                        })
                        .map((user) => user.name) || []
                    }
                    value={newUserName}
                  />
                  <Button
                    className="px-2"
                    data-testid="confirm-add-user-button"
                    disabled={isSubmitting || !newUserName.trim()}
                    onClick={handleAddUser}
                    size="sm"
                    variant="ghost"
                  >
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button
                    className="px-2"
                    disabled={isSubmitting}
                    onClick={handleCancel}
                    size="sm"
                    variant="destructive-ghost"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-full justify-start text-gray-600 hover:bg-white/60 hover:text-gray-900"
                  data-testid="add-user-principal-button"
                  onClick={() => setIsAddingUser(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add user/principal
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
