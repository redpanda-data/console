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
import { Badge } from 'components/redpanda-ui/components/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import { Field, FieldContent, FieldDescription, FieldLabel } from 'components/redpanda-ui/components/field';
import { Switch } from 'components/redpanda-ui/components/switch';
import { cn } from 'components/redpanda-ui/lib/utils';
import { ChevronRightIcon, PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BoxSettingsInput } from 'react-query/api/shadow-box';

export type PrincipalSuggestion = { principal: string; linkName: string };

type ShadowBoxSettingsFieldsProps = {
  value: BoxSettingsInput;
  onChange: (value: BoxSettingsInput) => void;
  /** Users the links that read from this cluster authenticate as, when the host knows them. */
  suggestions: PrincipalSuggestion[];
};

export const ShadowBoxSettingsFields = ({ value, onChange, suggestions }: ShadowBoxSettingsFieldsProps) => {
  const advancedInUse = value.allowAllReads || value.skipTransactionExpiration;
  const [advancedOpen, setAdvancedOpen] = useState(advancedInUse);

  // Settings loaded after opening (another tab saved them) can turn an advanced option on; show it.
  useEffect(() => {
    if (advancedInUse) {
      setAdvancedOpen(true);
    }
  }, [advancedInUse]);
  const missingSuggestions = suggestions.filter(({ principal }) => !value.exemptPrincipals.includes(principal));
  /** Which links each principal lets finish syncing, so a pre-added name explains itself. */
  const linkNotes = new Map<string, string>();
  for (const { principal, linkName } of suggestions) {
    linkNotes.set(principal, linkNotes.has(principal) ? `${linkNotes.get(principal)}, ${linkName}` : linkName);
  }

  return (
    <div className="flex flex-col gap-5">
      <Field data-disabled={value.allowAllReads}>
        <FieldLabel htmlFor="shadow-box-exempt-principals-input">Exempt principals</FieldLabel>
        <TagChipInput
          id="shadow-box-exempt-principals-input"
          mono
          noteFor={(principal) => linkNotes.get(principal)}
          onChange={(exemptPrincipals) => onChange({ ...value, exemptPrincipals })}
          placeholder={value.exemptPrincipals.length === 0 ? 'shadow-link-user' : 'Add a principal'}
          testId="shadow-box-exempt-principals"
          value={value.exemptPrincipals}
        />
        <FieldDescription>
          They can still read topics while the cluster is boxed. Add each shadow link’s user, or the link can’t finish
          syncing. Enter bare user names, such as <span className="font-mono">shadow-orders</span>; a link that uses
          mTLS reads as the principal its mapping rules produce.
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
                    onClick={() => onChange({ ...value, exemptPrincipals: [...value.exemptPrincipals, principal] })}
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
                <FieldLabel htmlFor="shadow-box-allow-all-reads">Let every consumer keep reading</FieldLabel>
                <FieldDescription>
                  Only writes and cluster changes stop, so exempt principals don’t matter. Consumers can keep reading
                  while you repoint them.
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
                <FieldLabel htmlFor="shadow-box-skip-transaction-expiration">
                  Leave open transactions to time out
                </FieldLabel>
                <FieldDescription>
                  By default, each broker aborts open transactions once it applies the box, so the shadow link can
                  finish syncing. Turn this on to let them time out on their own instead.
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
