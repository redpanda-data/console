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

import { TagChipInput } from 'components/pages/shadowlinks/create/configuration/schema-registry/tag-chip-input';
import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Field, FieldContent, FieldDescription, FieldLabel } from 'components/redpanda-ui/components/field';
import { Switch } from 'components/redpanda-ui/components/switch';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronRightIcon, PlusIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useClusterFenceStore } from 'stores/cluster-fence-store';
import { z } from 'zod';

import {
  exemptNameFor,
  getReadPolicyWarnings,
  type ReadPolicy,
  SUPERUSERS_NOT_EXEMPT,
  toExemptName,
} from './cluster-fence-model';

export const readPolicySchema = z.object({ exemptPrincipals: z.array(z.string()), allowAllReads: z.boolean() });

/** A user a link that reads from this cluster authenticates as; `''` for a link with no SASL or mTLS. */
export type PrincipalSuggestion = { principal: string; linkName: string };

/** The users of the shadow links that read from this cluster, offered as exempt principals. */
export const useReaderSuggestions = () => {
  const readers = useClusterFenceStore((state) => state.topology?.readers);
  return useMemo<PrincipalSuggestion[]>(
    () =>
      (readers ?? []).flatMap((reader) => {
        const principal = exemptNameFor(reader);
        return principal === undefined ? [] : [{ principal, linkName: reader.linkName }];
      }),
    [readers]
  );
};

type ClusterFenceSettingsFieldsProps = {
  value: ReadPolicy;
  onChange: (value: ReadPolicy) => void;
  /** Users the links that read from this cluster authenticate as, when the host knows them. */
  suggestions: PrincipalSuggestion[];
};

export const WARNING_VARIANT = { danger: 'destructive', warning: 'warning', info: 'informative' } as const;

/** Which links each principal lets finish copying, so a pre-added name explains itself. */
const linkNotesFor = (suggestions: PrincipalSuggestion[]) => {
  const notes = new Map<string, string>();
  for (const { principal, linkName } of suggestions) {
    notes.set(principal, notes.has(principal) ? `${notes.get(principal)}, ${linkName}` : linkName);
  }
  return notes;
};

type PolicyFieldProps = {
  value: ReadPolicy;
  setPrincipals: (exemptPrincipals: string[]) => void;
  suggestions: PrincipalSuggestion[];
};

const ExemptUsersField = ({ value, setPrincipals, suggestions }: PolicyFieldProps) => {
  const blankExempt = value.exemptPrincipals.includes('');
  const named = value.exemptPrincipals.filter(Boolean);
  /** Redpanda matches bare user names, so a typed `User:` prefix is dropped rather than warned about. */
  const setNamed = (names: string[]) => {
    const bare = Array.from(new Set(names.map(toExemptName).filter(Boolean)));
    setPrincipals(blankExempt ? [...bare, ''] : bare);
  };
  const missingSuggestions = suggestions.filter(
    ({ principal }) => principal !== '' && !value.exemptPrincipals.includes(principal)
  );
  const linkNotes = linkNotesFor(suggestions);
  const warnings = getReadPolicyWarnings(value.exemptPrincipals, value.allowAllReads).filter(
    (warning) => warning.id !== 'blank'
  );

  return (
    <Field data-disabled={value.allowAllReads}>
      <FieldLabel htmlFor="cluster-fence-exempt-principals-input">Exempt users</FieldLabel>
      <TagChipInput
        id="cluster-fence-exempt-principals-input"
        mono
        noteFor={(principal) => linkNotes.get(principal)}
        onChange={setNamed}
        placeholder="Add a user"
        testId="cluster-fence-exempt-principals"
        value={named}
      />
      <FieldDescription>
        While the cluster is fenced, only these users can fetch from user topics, such as a shadow link’s user.{' '}
        {SUPERUSERS_NOT_EXEMPT}
      </FieldDescription>
      {missingSuggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="cluster-fence-principal-suggestions">
          <span className="text-body-sm text-muted-foreground">From shadow links that read from this cluster:</span>
          {missingSuggestions.map(({ principal, linkName }) => (
            <Badge
              icon={<PlusIcon />}
              key={`${linkName}-${principal}`}
              render={
                <button
                  aria-label={`Add ${principal}, the user of ${linkName}`}
                  onClick={() => setPrincipals([...value.exemptPrincipals, principal])}
                  type="button"
                />
              }
              tone="primary"
              variant="outline"
            >
              <span className="font-mono">{principal}</span>
              <span className="text-muted-foreground">{linkName}</span>
            </Badge>
          ))}
        </div>
      ) : null}
      {warnings.map((warning) => (
        <Alert
          key={warning.id}
          testId={`cluster-fence-settings-warning-${warning.id}`}
          variant={WARNING_VARIANT[warning.severity]}
        >
          <AlertDescription>
            <p>{warning.message}</p>
            {warning.fix ? (
              <div className="mt-2">
                <Button
                  onClick={() =>
                    setPrincipals(warning.fix?.principals(value.exemptPrincipals) ?? value.exemptPrincipals)
                  }
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  {warning.fix.label}
                </Button>
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ))}
    </Field>
  );
};

const UnauthenticatedExemptField = ({ value, setPrincipals, suggestions }: PolicyFieldProps) => {
  const blankExempt = value.exemptPrincipals.includes('');
  const named = value.exemptPrincipals.filter(Boolean);
  const unauthenticatedLinks = suggestions.filter(({ principal }) => principal === '').map(({ linkName }) => linkName);

  return (
    <Field data-disabled={value.allowAllReads} orientation="horizontal">
      <Switch
        checked={blankExempt}
        id="cluster-fence-exempt-unauthenticated"
        onCheckedChange={(on) => setPrincipals(on ? [...named, ''] : named)}
        testId="cluster-fence-exempt-unauthenticated"
      />
      <FieldContent>
        <FieldLabel htmlFor="cluster-fence-exempt-unauthenticated">Exempt clients without SASL or mTLS</FieldLabel>
        <FieldDescription>
          Adds an empty name to the list, which matches clients that connect without SASL or mTLS.
          {unauthenticatedLinks.length > 0
            ? ` ${unauthenticatedLinks.join(', ')} ${unauthenticatedLinks.length === 1 ? 'connects' : 'connect'} that way.`
            : ''}
        </FieldDescription>
      </FieldContent>
    </Field>
  );
};

const AdvancedOptions = ({ value, onChange }: Pick<ClusterFenceSettingsFieldsProps, 'value' | 'onChange'>) => {
  const advancedInUse = value.allowAllReads;
  const [advancedOpen, setAdvancedOpen] = useState(advancedInUse);

  // Settings loaded after opening (another tab saved them) can turn an advanced option on; show it.
  useEffect(() => {
    if (advancedInUse) {
      setAdvancedOpen(true);
    }
  }, [advancedInUse]);

  return (
    <Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
      <CollapsibleTrigger
        render={
          <button className="flex items-center gap-1 text-label" type="button">
            <span
              className={cn('flex transition-transform motion-reduce:transition-none', advancedOpen && 'rotate-90')}
            >
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </span>
            Advanced options
          </button>
        }
      />
      <CollapsibleContent>
        <div className="flex flex-col gap-4 pt-3">
          <Field orientation="horizontal">
            <Switch
              checked={value.allowAllReads}
              id="cluster-fence-allow-all-reads"
              onCheckedChange={(allowAllReads) => onChange({ ...value, allowAllReads })}
              testId="cluster-fence-allow-all-reads"
            />
            <FieldContent>
              <FieldLabel htmlFor="cluster-fence-allow-all-reads">Allow all reads</FieldLabel>
              <FieldDescription>
                Every consumer can keep fetching while the fence rejects writes, so the exempt list doesn’t matter.
                Consumers can keep reading while you repoint them.
              </FieldDescription>
            </FieldContent>
          </Field>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

/**
 * The read policy, with the warnings the broker would otherwise only log on
 * the controller leader. The empty name, which exempts clients without SASL or mTLS, can't be typed
 * as a chip, so it has its own switch.
 */
export const ClusterFenceSettingsFields = ({ value, onChange, suggestions }: ClusterFenceSettingsFieldsProps) => {
  const setPrincipals = (exemptPrincipals: string[]) => onChange({ ...value, exemptPrincipals });

  return (
    <div className="flex flex-col gap-5">
      <ExemptUsersField setPrincipals={setPrincipals} suggestions={suggestions} value={value} />
      <UnauthenticatedExemptField setPrincipals={setPrincipals} suggestions={suggestions} value={value} />
      <AdvancedOptions onChange={onChange} value={value} />
    </div>
  );
};
