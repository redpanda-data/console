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

import { useNavigate } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';

import { getRuleDataTestId, parsePrincipal, type Rule, type SharedConfig } from './acl-model';
import { OperationsBadge } from './operations-badge';

type ACLDetailsProps = {
  sharedConfig: {
    principal: string;
    host: string;
  };
  rules: Rule[];
  isSimpleView?: boolean; // this prop show SharedConfig, this is used for emmbedded this component on legacy user page
};

export function ACLDetails({ sharedConfig, rules, isSimpleView = false }: ACLDetailsProps) {
  const navigate = useNavigate();

  const getGoTo = (sc: SharedConfig) => {
    if (sc.principal.startsWith('User:')) {
      return `/security/acls/${parsePrincipal(sc.principal).name}/details`;
    }
    if (sc.principal.startsWith('RedpandaRole:')) {
      return `/security/roles/${parsePrincipal(sc.principal).name}/details`;
    }
    return '';
  };

  const data = {
    sharedConfig,
    rules,
    principalType: parsePrincipal(sharedConfig.principal).type,
    hostType: sharedConfig.host === '*' ? 'Allow all hosts' : 'Specific host',
  };

  return (
    <div>
      {/* Main Content */}
      <main>
        <div className="mx-auto">
          <div className="grid grid-cols-1 gap-8">
            {/* Left Column - Configuration Details */}
            <div className="space-y-6">
              {/* Shared Configuration */}
              <Card className={isSimpleView ? 'hidden' : ''} size="full">
                <CardHeader>
                  <CardTitle data-testid={'share-config-title'} level={3}>
                    Shared configuration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="mb-1 text-body font-medium text-foreground">Principal</div>
                      <div className="text-body text-strong">
                        <span className="text-subtle">{data.principalType}:</span>{' '}
                        <span>{parsePrincipal(data.sharedConfig.principal).name}</span>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-body font-medium text-foreground">Host</div>
                      <div className="text-body text-strong">
                        <span className="text-subtle">{data.hostType}:</span>{' '}
                        <span className="font-mono">{data.sharedConfig.host}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Rules */}
              <Card size="full" variant={isSimpleView ? 'elevated' : undefined}>
                <CardHeader>
                  <CardTitle data-testid={'acl-rules-length'} level={3}>
                    {isSimpleView ? (
                      <Button onClick={() => navigate({ to: getGoTo(sharedConfig) })} variant="link">
                        {sharedConfig.principal}
                      </Button>
                    ) : (
                      `ACL rules (${data.rules.length})`
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.rules.length === 0 ? (
                    <div className="py-8 text-center text-subtle">No permissions configured</div>
                  ) : (
                    data.rules.map((rule: Rule) => (
                      <div
                        className="rounded-lg border border-border p-4"
                        data-testid={`summary-card-${getRuleDataTestId(rule)}`}
                        key={rule.id}
                      >
                        <OperationsBadge rule={rule} />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
