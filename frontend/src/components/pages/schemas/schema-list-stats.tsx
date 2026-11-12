import { EditIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import { Skeleton } from 'components/redpanda-ui/components/skeleton';
import { Stat, StatGroup } from 'components/redpanda-ui/components/stat';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { hoverableWhenDisabled } from 'components/ui/disabled-reason-tooltip';

import { SchemaContextSelector } from './schema-context-selector';
import { type DerivedContext, isNamedContext } from './schema-context-utils';
import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';

export function SchemaListStats({
  schemaRegistryContextsSupported,
  selectedContext,
  derivedContexts,
  displayMode,
  displayCompat,
  onContextChange,
  manageFencedReason,
}: {
  schemaRegistryContextsSupported: boolean;
  selectedContext: string;
  derivedContexts: DerivedContext[];
  displayMode: string | null | undefined;
  displayCompat: string | null | undefined;
  onContextChange: (context: string) => void;
  manageFencedReason: string | undefined;
}) {
  return (
    <StatGroup className="w-fit" columns={schemaRegistryContextsSupported ? 3 : 2} gap="lg" testId="schema-list-stats">
      {schemaRegistryContextsSupported && (
        <Stat
          label="Context"
          testId="schema-list-context-stat"
          value={
            <SchemaContextSelector
              contexts={derivedContexts}
              onContextChange={onContextChange}
              selectedContext={selectedContext}
            />
          }
        />
      )}
      <Stat
        label={isNamedContext(selectedContext) && schemaRegistryContextsSupported ? 'Context mode' : 'Mode'}
        testId="schema-list-mode-stat"
        value={
          <div className="flex items-center gap-1.5">
            {displayMode ?? <Skeleton variant="text" width="sm" />}
            <Tooltip>
              <TooltipTrigger
                render={hoverableWhenDisabled(
                  manageFencedReason,
                  <Button
                    aria-label="Edit mode"
                    data-testid="schema-list-edit-mode-btn"
                    disabled={api.userData?.canManageSchemaRegistry === false || Boolean(manageFencedReason)}
                    onClick={() =>
                      isNamedContext(selectedContext) && schemaRegistryContextsSupported
                        ? appGlobal.historyPush(
                            `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/edit-mode`
                          )
                        : appGlobal.historyPush('/schema-registry/edit-mode')
                    }
                    size="icon-xs"
                    variant="ghost"
                  >
                    <EditIcon />
                  </Button>
                )}
              />
              {api.userData?.canManageSchemaRegistry === false && (
                <TooltipContent side="top">You don't have the 'canManageSchemaRegistry' permission</TooltipContent>
              )}
              {Boolean(manageFencedReason) && <TooltipContent side="top">{manageFencedReason}</TooltipContent>}
            </Tooltip>
          </div>
        }
      />
      <Stat
        label={
          isNamedContext(selectedContext) && schemaRegistryContextsSupported ? 'Context compatibility' : 'Compatibility'
        }
        testId="schema-list-compatibility-stat"
        value={
          <div className="flex items-center gap-1.5">
            {displayCompat ?? <Skeleton variant="text" width="sm" />}
            <Tooltip>
              <TooltipTrigger
                render={hoverableWhenDisabled(
                  manageFencedReason,
                  <Button
                    aria-label="Edit compatibility"
                    data-testid="schema-list-edit-compatibility-btn"
                    disabled={api.userData?.canManageSchemaRegistry === false || Boolean(manageFencedReason)}
                    onClick={() =>
                      isNamedContext(selectedContext) && schemaRegistryContextsSupported
                        ? appGlobal.historyPush(
                            `/schema-registry/contexts/${encodeURIComponent(selectedContext)}/edit-compatibility`
                          )
                        : appGlobal.historyPush('/schema-registry/edit-compatibility')
                    }
                    size="icon-xs"
                    variant="ghost"
                  >
                    <EditIcon />
                  </Button>
                )}
              />
              {api.userData?.canManageSchemaRegistry === false && (
                <TooltipContent side="top">You don't have the 'canManageSchemaRegistry' permission</TooltipContent>
              )}
              {Boolean(manageFencedReason) && <TooltipContent side="top">{manageFencedReason}</TooltipContent>}
            </Tooltip>
          </div>
        }
      />
    </StatGroup>
  );
}
