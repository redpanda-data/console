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
import { api } from '../../../state/backend-api';
import { AutocompleteInput } from '../acls/new-acl/autocomplete-input';

type MatchingUsersCardProps = {
  principalType: string;
  principal: string;
};

export function MatchingUsersCard({ principalType, principal }: MatchingUsersCardProps) {
  const roleName = principalType === 'RedpandaRole' ? parsePrincipal(principal).name : '';

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [principalTypeToAdd, setPrincipalTypeToAdd] = useState<'User' | 'Group'>('User');
  const [deletingPrincipal, setDeletingPrincipal] = useState<string | null>(null);

  const toast = useToast();

  const gbacEnabled = api.enterpriseFeaturesUsed.some((f) => f.name === 'gbac' && f.enabled);

  const { data: membersData, isLoading } = useListRoleMembersQuery(create(ListRoleMembersRequestSchema, { roleName }));

  const { data: usersData } = useListUsersQuery(create(ListUsersRequestSchema));

  const { mutateAsync: updateMembership, isPending: isSubmitting } = useUpdateRoleMembershipMutation();

  const userMembers = membersData?.members?.filter((m) => parsePrincipal(m.principal).type === 'User') ?? [];
  const groupMembers = membersData?.members?.filter((m) => parsePrincipal(m.principal).type === 'Group') ?? [];

  const handleAddMember = async () => {
    if (!newUserName.trim()) {
      toast({
        status: 'error',
        description: `Please enter a ${principalTypeToAdd === 'Group' ? 'group name' : 'username'}`,
      });
      return;
    }

    try {
      await updateMembership(
        create(UpdateRoleMembershipRequestSchema, {
          roleName,
          add: [{ principal: `${principalTypeToAdd}:${newUserName.trim()}` }],
          remove: [],
          create: true,
        })
      );
      toast({
        status: 'success',
        description: `${principalTypeToAdd} "${newUserName}" added to role successfully`,
      });
      setNewUserName('');
      setIsAddingUser(false);
      setPrincipalTypeToAdd('User');
    } catch (_error) {
      // Error handling is done in onError callback
    }
  };

  const handleRemoveMember = async (memberPrincipal: string) => {
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
      toast({
        status: 'success',
        description: 'Member removed from role successfully',
      });
      setDeletingPrincipal(null);
    } catch (_error) {
      // Error handling is done in onError callback
    }
  };

  const handleCancel = () => {
    setNewUserName('');
    setIsAddingUser(false);
    setPrincipalTypeToAdd('User');
  };

  const membersCount =
    principalType === 'RedpandaRole' ? userMembers.length + (gbacEnabled ? groupMembers.length : 0) : 3;

  const renderMemberRow = (memberPrincipal: string, displayName: string, testIdPrefix: string) => {
    const isDeleting = deletingPrincipal === memberPrincipal;
    return (
      <div
        className="group flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white/40 font-normal text-gray-900 text-sm transition-colors hover:bg-white/60"
        key={memberPrincipal}
        style={{ padding: '8px 10px' }}
      >
        <span className="flex-1 text-left">{displayName}</span>
        <Button
          className="h-auto p-1 opacity-100 transition-opacity"
          data-testid={`remove-${testIdPrefix}-${displayName}-button`}
          disabled={isDeleting}
          onClick={() => handleRemoveMember(memberPrincipal)}
          size="sm"
          variant="destructive-ghost"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="lg:col-span-1">
      <Card className="bg-slate-100" size="full">
        <CardHeader>
          <h3>Matching users / principals ({membersCount})</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1">
            {isLoading && principalType === 'RedpandaRole' && (
              <div className="text-gray-500 text-sm italic">Loading members...</div>
            )}

            {principalType === 'RedpandaRole' && !isLoading && (
              <>
                {/* Users section */}
                <p className="font-medium text-gray-700 text-xs uppercase tracking-wide">Users</p>
                {userMembers.length > 0 ? (
                  userMembers.map((member) => {
                    const name = parsePrincipal(member.principal).name || member.principal;
                    return renderMemberRow(member.principal, name, 'user');
                  })
                ) : (
                  <div className="text-gray-500 text-sm italic">No user members</div>
                )}

                {/* Groups section — only when GBAC is enabled */}
                {gbacEnabled && (
                  <>
                    <p className="mt-2 font-medium text-gray-700 text-xs uppercase tracking-wide">Groups</p>
                    {groupMembers.length > 0 ? (
                      groupMembers.map((member) => {
                        const name = parsePrincipal(member.principal).name || member.principal;
                        return renderMemberRow(member.principal, name, 'group');
                      })
                    ) : (
                      <div className="text-gray-500 text-sm italic">No group members</div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Add member — only for RedpandaRole */}
          {principalType === 'RedpandaRole' && (
            <div className="border-gray-200 border-t pt-2">
              {isAddingUser ? (
                <div className="flex flex-col gap-2">
                  {gbacEnabled && (
                    <div className="flex gap-1">
                      <Button
                        className="flex-1"
                        onClick={() => setPrincipalTypeToAdd('User')}
                        size="sm"
                        variant={principalTypeToAdd === 'User' ? 'outline' : 'ghost'}
                      >
                        User
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => setPrincipalTypeToAdd('Group')}
                        size="sm"
                        variant={principalTypeToAdd === 'Group' ? 'outline' : 'ghost'}
                      >
                        Group
                      </Button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {principalTypeToAdd === 'User' ? (
                      <AutocompleteInput
                        className="flex-1 text-sm"
                        data-testid="add-user-input"
                        onChange={setNewUserName}
                        placeholder="Select or enter username..."
                        suggestions={
                          usersData?.users
                            ?.filter((user) => {
                              const userPrincipal = `User:${user.name}`;
                              return !membersData?.members?.some((member) => member.principal === userPrincipal);
                            })
                            .map((user) => user.name) || []
                        }
                        value={newUserName}
                      />
                    ) : (
                      <input
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        data-testid="add-group-input"
                        onChange={(e) => setNewUserName(e.target.value)}
                        placeholder="Enter group name..."
                        value={newUserName}
                      />
                    )}
                    <Button
                      className="px-2"
                      data-testid="confirm-add-user-button"
                      disabled={isSubmitting || !newUserName.trim()}
                      onClick={handleAddMember}
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
