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

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader } from 'components/redpanda-ui/components/card';
import { Empty, EmptyTitle } from 'components/redpanda-ui/components/empty';
import { Input } from 'components/redpanda-ui/components/input';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useGbacEnabled } from '../hooks/use-gbac-enabled';
import { useNonMemberUserNames, useRoleMembership } from '../hooks/use-role-membership';
import { parsePrincipal } from '../shared/acl-model';
import { AutocompleteInput } from '../shared/autocomplete-input';

type MatchingUsersCardProps = {
  principalType: string;
  principal: string;
};

type RoleMember = { principal: string };

type RoleMemberRowProps = {
  member: RoleMember;
  testIdPrefix: string;
  isDeleting: boolean;
  onRemove: (memberPrincipal: string) => void;
};

const RoleMemberRow = ({ member, testIdPrefix, isDeleting, onRemove }: RoleMemberRowProps) => {
  const displayName = parsePrincipal(member.principal).name || member.principal;
  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border border-border bg-card/40 px-[10px] py-2 text-body font-normal text-strong transition-colors hover:bg-card/60">
      <span className="flex-1 text-left">{displayName}</span>
      <Button
        aria-label={`Remove ${displayName}`}
        data-testid={`remove-${testIdPrefix}-${displayName}-button`}
        disabled={isDeleting}
        onClick={() => onRemove(member.principal)}
        size="icon-xs"
        variant="destructive-ghost"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

type RoleMemberSectionProps = Omit<RoleMemberRowProps, 'member' | 'isDeleting'> & {
  members: RoleMember[];
  emptyTitle: string;
  deletingPrincipal: string | null;
};

const RoleMemberSection = ({ members, emptyTitle, deletingPrincipal, ...rowProps }: RoleMemberSectionProps) =>
  members.length > 0 ? (
    members.map((member) => (
      <RoleMemberRow
        isDeleting={deletingPrincipal === member.principal}
        key={member.principal}
        member={member}
        {...rowProps}
      />
    ))
  ) : (
    <Empty>
      <EmptyTitle>{emptyTitle}</EmptyTitle>
    </Empty>
  );

type AddRoleMemberProps = {
  gbacEnabled: boolean;
  isSubmitting: boolean;
  /** Users not in the role yet. */
  userSuggestions: string[];
  onAdd: (principalType: 'User' | 'Group', name: string) => Promise<boolean>;
};

const AddRoleMember = ({ gbacEnabled, isSubmitting, userSuggestions, onAdd }: AddRoleMemberProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [principalType, setPrincipalType] = useState<'User' | 'Group'>('User');

  const reset = () => {
    setName('');
    setIsAdding(false);
    setPrincipalType('User');
  };

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error(`Enter a ${principalType === 'Group' ? 'group name' : 'username'}`);
      return;
    }
    if (await onAdd(principalType, name)) {
      reset();
    }
  };

  if (!isAdding) {
    return (
      <Button
        className="w-full justify-start"
        data-testid="add-user-principal-button"
        onClick={() => setIsAdding(true)}
        size="sm"
        variant="ghost"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add user/principal
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {gbacEnabled && (
        <div className="flex gap-1">
          <Button
            className="flex-1"
            onClick={() => setPrincipalType('User')}
            size="sm"
            variant={principalType === 'User' ? 'outline' : 'ghost'}
          >
            User
          </Button>
          <Button
            className="flex-1"
            onClick={() => setPrincipalType('Group')}
            size="sm"
            variant={principalType === 'Group' ? 'outline' : 'ghost'}
          >
            Group
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        {principalType === 'User' ? (
          <AutocompleteInput
            className="flex-1"
            data-testid="add-user-input"
            onChange={setName}
            placeholder="Select or enter username..."
            suggestions={userSuggestions}
            value={name}
          />
        ) : (
          <Input
            containerClassName="flex-1"
            data-testid="add-group-input"
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name..."
            size="sm"
            value={name}
          />
        )}
        <Button
          aria-label="Add member"
          data-testid="confirm-add-user-button"
          disabled={isSubmitting || !name.trim()}
          onClick={handleAdd}
          size="icon-sm"
          variant="primary-ghost"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button aria-label="Cancel" disabled={isSubmitting} onClick={reset} size="icon-sm" variant="destructive-ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export function MatchingUsersCard({ principalType, principal }: MatchingUsersCardProps) {
  const isRole = principalType === 'RedpandaRole';
  const gbacEnabled = useGbacEnabled();
  const membership = useRoleMembership(isRole ? parsePrincipal(principal).name : '');
  const userSuggestions = useNonMemberUserNames(membership.members);
  const membersCount = isRole ? membership.userMembers.length + (gbacEnabled ? membership.groupMembers.length : 0) : 3;

  return (
    <div className="lg:col-span-1">
      <Card size="full">
        <CardHeader>
          <h3>Matching users / principals ({membersCount})</h3>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1">
            {membership.isLoading && isRole && <div className="text-body text-subtle italic">Loading members...</div>}

            {isRole && !membership.isLoading && (
              <>
                {/* Users section */}
                <span className="text-body-sm font-medium tracking-wide text-foreground uppercase">Users</span>
                <RoleMemberSection
                  deletingPrincipal={membership.deletingPrincipal}
                  emptyTitle="No user members"
                  members={membership.userMembers}
                  onRemove={membership.removeMember}
                  testIdPrefix="user"
                />

                {/* Groups section — only when GBAC is enabled */}
                {gbacEnabled && (
                  <>
                    <span className="mt-2 text-body-sm font-medium tracking-wide text-foreground uppercase">
                      Groups
                    </span>
                    <RoleMemberSection
                      deletingPrincipal={membership.deletingPrincipal}
                      emptyTitle="No group members"
                      members={membership.groupMembers}
                      onRemove={membership.removeMember}
                      testIdPrefix="group"
                    />
                  </>
                )}
              </>
            )}
          </div>

          {/* Add member — only for RedpandaRole */}
          {isRole && (
            <div className="border-t border-border pt-2">
              <AddRoleMember
                gbacEnabled={gbacEnabled}
                isSubmitting={membership.isSubmitting}
                onAdd={membership.addMember}
                userSuggestions={userSuggestions}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
