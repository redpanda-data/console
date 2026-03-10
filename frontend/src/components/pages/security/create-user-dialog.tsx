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
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Checkbox } from 'components/redpanda-ui/components/checkbox';
import { CopyButton } from 'components/redpanda-ui/components/copy-button';
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
import { Separator } from 'components/redpanda-ui/components/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Text } from 'components/redpanda-ui/components/typography';
import { Info, RefreshCw, Shield, UserCog } from 'lucide-react';
import { CreateUserRequest_UserSchema, CreateUserRequestSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { useState } from 'react';
import { getSASLMechanism, useCreateUserMutation } from 'react-query/api/user';
import { toast } from 'sonner';

const saslMechanisms = [
  { id: 'SCRAM-SHA-256', name: 'SCRAM-SHA-256', description: 'Salted Challenge Response with SHA-256' },
  { id: 'SCRAM-SHA-512', name: 'SCRAM-SHA-512', description: 'Salted Challenge Response with SHA-512 (recommended)' },
] as const;

export function generatePassword(length: number, includeSpecial: boolean): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  let chars = lowercase + uppercase + numbers;
  if (includeSpecial) {
    chars += special;
  }
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

function createGeneratedPassword(includeSpecial: boolean): string {
  return generatePassword(24, includeSpecial);
}

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  onNavigateToTab: (tab: string) => void;
}

export function CreateUserDialog({ open, onClose, onNavigateToTab }: CreateUserDialogProps) {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => createGeneratedPassword(true));
  const [mechanism, setMechanism] = useState<'SCRAM-SHA-256' | 'SCRAM-SHA-512'>('SCRAM-SHA-256');
  const [error, setError] = useState<string | null>(null);
  const [includeSpecial, setIncludeSpecial] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { mutateAsync: createUserMutation } = useCreateUserMutation();

  const resetForm = () => {
    setStep('form');
    setUsername('');
    setPassword(createGeneratedPassword(true));
    setMechanism('SCRAM-SHA-256');
    setError(null);
    setIncludeSpecial(true);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGeneratePassword = () => {
    const pwd = createGeneratedPassword(includeSpecial);
    setPassword(pwd);
    setError(null);
  };

  const handleCreate = async () => {
    if (!username.trim()) {
      setError('Username is required');
      return;
    }
    if (/\s/.test(username)) {
      setError('Username must not contain whitespace');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      setError('Only letters, numbers, dots, hyphens, and underscores are allowed');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (password.length > 64) {
      setError('Password should not exceed 64 characters');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      await createUserMutation(
        create(CreateUserRequestSchema, {
          user: create(CreateUserRequest_UserSchema, {
            name: username.trim(),
            password,
            mechanism: getSASLMechanism(mechanism),
          }),
        })
      );
      setStep('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={(o) => !o && handleClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        {step === 'form' ? (
          <>
            <DialogHeader spacing="loose">
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>Create a new SASL-SCRAM user for your cluster.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Username */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="create-username">Username</Label>
                  <Text variant="muted">
                    Must not contain any whitespace. Dots, hyphens, and underscores may be used.
                  </Text>
                </div>
                <Input
                  autoComplete="off"
                  id="create-username"
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setError(null);
                  }}
                  placeholder="Username"
                  type="text"
                  value={username}
                />
              </div>

              {/* Password */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="create-password">Password</Label>
                  <Text variant="muted">Must be at least 4 characters and should not exceed 64 characters.</Text>
                </div>
                <div className="flex gap-1.5">
                  <Input
                    autoComplete="new-password"
                    className="font-mono"
                    id="create-password"
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Enter password"
                    type="password"
                    value={password}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="size-9"
                          onClick={handleGeneratePassword}
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
                  <CopyButton content={password} disabled={!password} size="icon" variant="outline" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={includeSpecial}
                    id="create-special-chars"
                    onCheckedChange={(checked) => setIncludeSpecial(checked === true)}
                  />
                  <Label className="font-normal text-base" htmlFor="create-special-chars">
                    Generate with special characters
                  </Label>
                </div>
              </div>

              {/* SASL Mechanism */}
              <div className="space-y-3">
                <Label htmlFor="create-mechanism">SASL Mechanism</Label>
                <Select onValueChange={(v) => setMechanism(v as 'SCRAM-SHA-256' | 'SCRAM-SHA-512')} value={mechanism}>
                  <SelectTrigger id="create-mechanism">
                    <SelectValue>
                      <span className="font-mono">{mechanism}</span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {saslMechanisms.map((mech) => (
                      <SelectItem className="py-2.5" key={mech.id} value={mech.id}>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-base">{mech.name}</span>
                          <span className="text-base text-muted-foreground leading-6">{mech.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {Boolean(error) && <p className="text-base text-destructive leading-6">{error}</p>}
            </div>

            <DialogFooter>
              <Button onClick={handleClose} variant="outline">
                Cancel
              </Button>
              <Button disabled={isSubmitting} onClick={handleCreate}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader spacing="loose">
              <DialogTitle>User Created</DialogTitle>
              <DialogDescription>The user has been created. Make sure to save the credentials below.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <Alert>
                <Info className="size-4" />
                <AlertDescription>
                  You will not be able to view this password again. Make sure that it is copied and saved.
                </AlertDescription>
              </Alert>

              {/* Username */}
              <div className="space-y-1">
                <Text className="font-medium" variant="bodyLarge">
                  Username
                </Text>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-base">{username}</code>
                  <CopyButton content={username} size="icon" variant="outline" />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <Text className="font-medium" variant="bodyLarge">
                  Password
                </Text>
                <div className="flex items-center gap-2">
                  <Input className="flex-1 font-mono" readOnly type="password" value={password} />
                  <CopyButton content={password} size="icon" variant="outline" />
                </div>
              </div>

              {/* Mechanism */}
              <div className="space-y-1">
                <Text className="font-medium" variant="bodyLarge">
                  Mechanism
                </Text>
                <p className="font-mono text-base">{mechanism}</p>
              </div>

              <Separator />

              {/* Next steps hint */}
              <div className="rounded-lg border border-dashed p-4">
                <Text className="font-medium" variant="bodyLarge">
                  What's next?
                </Text>
                <p className="mt-1 text-base text-muted-foreground leading-6">
                  This user has no permissions yet. Assign roles or create ACLs to grant access to cluster resources.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    onClick={() => {
                      handleClose();
                      onNavigateToTab('permissions');
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <Shield className="size-4" />
                    Create ACLs
                  </Button>
                  <Button
                    onClick={() => {
                      handleClose();
                      onNavigateToTab('roles');
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <UserCog className="size-4" />
                    Assign Roles
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
