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
import { useEffect, useState } from 'react';
import type { BoxSettingsInput } from 'react-query/api/shadow-box';

import { getReadPolicyWarnings, SUPERUSERS_NOT_EXEMPT } from './shadow-box-model';

/** A user a link that reads from this cluster authenticates as; `''` for a link with no SASL or mTLS. */
export type PrincipalSuggestion = { principal: string; linkName: string };

type ShadowBoxSettingsFieldsProps = {
  value: BoxSettingsInput;
  onChange: (value: BoxSettingsInput) => void;
  /** Users the links that read from this cluster authenticate as, when the host knows them. */
  suggestions: PrincipalSuggestion[];
};

const WARNING_VARIANT = { danger: 'destructive', warning: 'warning', info: 'informative' } as const;

/**
 * The read policy and transaction setting, with the warnings the broker would otherwise only log on
 * the controller leader. The empty name, which exempts clients without SASL or mTLS, can't be typed
 * as a chip, so it has its own switch.
 */
export const ShadowBoxSettingsFields = ({ value, onChange, suggestions }: ShadowBoxSettingsFieldsProps) => {
  const advancedInUse = value.allowAllReads || value.skipTransactionExpiration;
  const [advancedOpen, setAdvancedOpen] = useState(advancedInUse);

  // Settings loaded after opening (another tab saved them) can turn an advanced option on; show it.
  useEffect(() => {
    if (advancedInUse) {
      setAdvancedOpen(true);
    }
  }, [advancedInUse]);

  const blankExempt = value.exemptPrincipals.includes('');
  const named = value.exemptPrincipals.filter(Boolean);
  const setPrincipals = (exemptPrincipals: string[]) => onChange({ ...value, exemptPrincipals });
  const setNamed = (names: string[]) => setPrincipals(blankExempt ? [...names, ''] : names);
  const setBlank = (on: boolean) => setPrincipals(on ? [...named, ''] : named);

  const missingSuggestions = suggestions.filter(
    ({ principal }) => principal !== '' && !value.exemptPrincipals.includes(principal)
  );
  const unauthenticatedLinks = suggestions.filter(({ principal }) => principal === '').map(({ linkName }) => linkName);
  /** Which links each principal lets finish copying, so a pre-added name explains itself. */
  const linkNotes = new Map<string, string>();
  for (const { principal, linkName } of suggestions) {
    linkNotes.set(principal, linkNotes.has(principal) ? `${linkNotes.get(principal)}, ${linkName}` : linkName);
  }
  const warnings = getReadPolicyWarnings(value.exemptPrincipals, value.allowAllReads).filter(
    (warning) => warning.id !== 'blank'
  );

  return (
    <div className="flex flex-col gap-5">
      <Field data-disabled={value.allowAllReads}>
        <FieldLabel htmlFor="shadow-box-exempt-principals-input">Exempt users</FieldLabel>
        <TagChipInput
          id="shadow-box-exempt-principals-input"
          mono
          noteFor={(principal) => linkNotes.get(principal)}
          onChange={setNamed}
          placeholder={named.length === 0 ? 'shadow-link-user' : 'Add a user'}
          testId="shadow-box-exempt-principals"
          value={named}
        />
        <FieldDescription>
          While the cluster is boxed, only these users can fetch from user topics. Add each shadow link’s user, or the
          link can’t finish copying. Enter bare user names, such as <span className="font-mono">shadow-orders</span>,
          not <span className="font-mono">User:shadow-orders</span>. {SUPERUSERS_NOT_EXEMPT}
        </FieldDescription>
        {missingSuggestions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="shadow-box-principal-suggestions">
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
            testId={`shadow-box-settings-warning-${warning.id}`}
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

      <Field data-disabled={value.allowAllReads} orientation="horizontal">
        <Switch
          checked={blankExempt}
          id="shadow-box-exempt-unauthenticated"
          onCheckedChange={setBlank}
          testId="shadow-box-exempt-unauthenticated"
        />
        <FieldContent>
          <FieldLabel htmlFor="shadow-box-exempt-unauthenticated">Exempt clients without SASL or mTLS</FieldLabel>
          <FieldDescription>
            Adds an empty name to the list, which matches clients that connect without SASL or mTLS.
            {unauthenticatedLinks.length > 0
              ? ` ${unauthenticatedLinks.join(', ')} ${unauthenticatedLinks.length === 1 ? 'connects' : 'connect'} that way.`
              : ''}
          </FieldDescription>
        </FieldContent>
      </Field>

      <Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-label">
          <ChevronRightIcon
            aria-hidden="true"
            className={cn('size-4 transition-transform motion-reduce:transition-none', advancedOpen && 'rotate-90')}
          />
          Advanced options
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-4 pt-3">
            <Field orientation="horizontal">
              <Switch
                checked={value.allowAllReads}
                id="shadow-box-allow-all-reads"
                onCheckedChange={(allowAllReads) => onChange({ ...value, allowAllReads })}
                testId="shadow-box-allow-all-reads"
              />
              <FieldContent>
                <FieldLabel htmlFor="shadow-box-allow-all-reads">Allow all reads</FieldLabel>
                <FieldDescription>
                  Every consumer can keep fetching while the box rejects writes, so the exempt list doesn’t matter.
                  Consumers can keep reading while you repoint them.
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal">
              <Switch
                checked={value.skipTransactionExpiration}
                id="shadow-box-skip-transaction-expiration"
                onCheckedChange={(skipTransactionExpiration) => onChange({ ...value, skipTransactionExpiration })}
                testId="shadow-box-skip-transaction-expiration"
              />
              <FieldContent>
                <FieldLabel htmlFor="shadow-box-skip-transaction-expiration">Skip transaction expiration</FieldLabel>
                <FieldDescription>
                  By default, once the cluster is boxed the box ends open transactions, as a commit if the coordinator
                  had already decided to commit, so readers can move past them. Turn this on to leave them open.
                  Redpanda doesn’t report open transactions, so Console can’t list them.
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
