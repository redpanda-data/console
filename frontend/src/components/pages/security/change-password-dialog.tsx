/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { create } from '@bufbuild/protobuf';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from 'components/redpanda-ui/components/dialog';
import { Input } from 'components/redpanda-ui/components/input';
import { Label } from 'components/redpanda-ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { UpdateUserRequest_UserSchema, UpdateUserRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useState } from 'react';
import { getSASLMechanism, useUpdateUserMutationWithToast } from 'react-query/api/user';
import { toast } from 'sonner';

import { generatePassword } from './create-user-dialog';

const saslMechanisms = [
  { id: 'SCRAM-SHA-256', name: 'SCRAM-SHA-256', description: 'Salted Challenge Response with SHA-256' },
  { id: 'SCRAM-SHA-512', name: 'SCRAM-SHA-512', description: 'Salted Challenge Response with SHA-512 (recommended)' },
] as const;

interface ChangePasswordDialogProps {
  open: boolean;
  userName: string;
  currentMechanism?: string | null;
  onClose: () => void;
}

export function ChangePasswordDialog({ open, userName, currentMechanism, onClose }: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedMechanism, setSelectedMechanism] = useState<'SCRAM-SHA-256' | 'SCRAM-SHA-512'>(
    currentMechanism === 'SCRAM-SHA-256' || currentMechanism === 'SCRAM-SHA-512' ? currentMechanism : 'SCRAM-SHA-512'
  );
  const [error, setError] = useState<string | null>(null);

  const [includeSpecialChars, setIncludeSpecialChars] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { mutateAsync: updateUser } = useUpdateUserMutationWithToast();

  const resetForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setIncludeSpecialChars(true);
    setCopied(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGenerate = () => {
    const pwd = generatePassword(24, includeSpecialChars);
    setNewPassword(pwd);
    setConfirmPassword(pwd);
    setError(null);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (newPassword) {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async () => {
    if (!newPassword) {
      setError('Password is required');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword.length > 64) {
      setError('Password should not exceed 64 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await updateUser(
        create(UpdateUserRequestSchema, {
          user: create(UpdateUserRequest_UserSchema, {
            name: userName,
            password: newPassword,
            mechanism: getSASLMechanism(selectedMechanism),
          }),
        })
      );
      toast.success('Password updated successfully');
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={(o) => !o && handleClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              <p>Set a new password for this user.</p>
              <p className="font-mono text-foreground text-xs">{userName}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mechanism Selection */}
          <div className="space-y-2">
            <Label htmlFor="mechanism">SASL Mechanism</Label>
            <Select
              onValueChange={(v) => setSelectedMechanism(v as 'SCRAM-SHA-256' | 'SCRAM-SHA-512')}
              value={selectedMechanism}
            >
              <SelectTrigger id="mechanism">
                <SelectValue>
                  <span className="font-mono">{selectedMechanism}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {saslMechanisms.map((mech) => (
                  <SelectItem className="py-2.5" key={mech.id} value={mech.id}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-sm">{mech.name}</span>
                      <span className="text-muted-foreground text-xs">{mech.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <p className="text-muted-foreground text-xs">
              Must be at least 8 characters and should not exceed 64 characters.
            </p>
            <div className="flex gap-1.5">
              <Input
                autoComplete="new-password"
                className="font-mono"
                id="new-password"
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                  setCopied(false);
                }}
                placeholder="Enter new password"
                type="password"
                value={newPassword}
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-9 w-9 shrink-0"
                      onClick={handleGenerate}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw className="size-4" />
                      <span className="sr-only">Generate password</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generate password</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-9 w-9 shrink-0"
                      disabled={!newPassword}
                      onClick={handleCopy}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                      <span className="sr-only">Copy password</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? 'Copied!' : 'Copy password'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={includeSpecialChars}
                id="special-chars"
                onCheckedChange={(checked) => setIncludeSpecialChars(checked === true)}
              />
              <Label className="font-normal text-sm" htmlFor="special-chars">
                Generate with special characters
              </Label>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              autoComplete="new-password"
              className="font-mono"
              id="confirm-password"
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              placeholder="Confirm new password"
              type="password"
              value={confirmPassword}
            />
          </div>

          {Boolean(error) && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
