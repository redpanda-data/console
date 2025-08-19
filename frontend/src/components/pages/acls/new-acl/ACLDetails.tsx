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
import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Edit } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGetAclsByPrincipal } from '../../../../react-query/api/acl';
import { MatchingUsersCard } from '../../roles/MatchingUsersCard';
import {
  formatLabel,
  getIdFromRule,
  getOperationsForResourceType,
  getRuleDataTestId,
  parsePrincipal,
  type Rule,
  type SharedConfig,
} from './ACL.model';

// Helper function to get resource name
const getResourceName = (resourceType: string): string => {
  const resourceNames: Record<string, string> = {
    cluster: 'cluster',
    topic: 'topic',
    consumerGroup: 'consumer group',
    transactionalId: 'transactional ID',
    subject: 'subject',
    schemaRegistry: 'schema registry',
  };
  return resourceNames[resourceType] || resourceType;
};

// Helper function to get plural resource name
const getPluralResourceName = (resourceType: string): string => {
  const pluralNames: Record<string, string> = {
    cluster: 'clusters',
    topic: 'topics',
    consumerGroup: 'consumer groups',
    transactionalId: 'transactional IDs',
    subject: 'subjects',
    schemaRegistry: 'schema registries',
  };
  return pluralNames[resourceType] || resourceType;
};

interface ACLDetailsProps {
  sharedConfig: {
    principal: string;
    host: string;
  };
  rules: Rule[];
  onUpdateACL: () => void;
  showMatchingUsers?: boolean;
  isSimpleView?: boolean; // this prop show SharedConfig, this is used for emmbedded this component on legacy user page
}

export function ACLDetails({
  sharedConfig,
  rules,
  onUpdateACL,
  showMatchingUsers = false,
  isSimpleView = false,
}: ACLDetailsProps) {
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
      {/* Header */}
      <div className={`${isSimpleView ? 'hidden' : ''}`}>
        <div className=" py-4">
          <div className=" mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm text-gray-600">View the created ACL configuration</p>
                </div>
              </div>
              <Button
                className="bg-gray-900 hover:bg-gray-800 text-white"
                onClick={onUpdateACL}
                data-testid="update-acl-button"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main>
        <div className=" mx-auto">
          <div className={`grid grid-cols-1 ${showMatchingUsers ? 'lg:grid-cols-3' : ''} gap-8`}>
            {/* Left Column - Configuration Details */}
            <div className={`${showMatchingUsers ? 'lg:col-span-2' : ''} space-y-6`}>
              {/* Shared Configuration */}
              <Card size="full" className={`${isSimpleView ? 'hidden' : ''}`}>
                <CardHeader className="pb-4">
                  <CardTitle data-testid={'share-config-title'} className="text-lg font-medium text-gray-900">
                    Shared configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Principal</div>
                      <div className="text-sm text-gray-900">
                        <span className="text-gray-600">{data.principalType}:</span>{' '}
                        <span>{parsePrincipal(data.sharedConfig.principal).name}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Host</div>
                      <div className="text-sm text-gray-900">
                        <span className="text-gray-600">{data.hostType}:</span>{' '}
                        <span className="font-mono">{data.sharedConfig.host}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Rules */}
              <Card size="full" variant={isSimpleView ? 'elevated' : undefined} className="border-gray-200">
                <CardHeader>
                  <CardTitle data-testid={'acl-rules-length'} className="text-lg font-medium text-gray-900">
                    {isSimpleView ? (
                      <Button variant="link" onClick={() => navigate(getGoTo(sharedConfig))}>
                        {sharedConfig.principal}
                      </Button>
                    ) : (
                      `ACL rules (${data.rules.length})`
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.rules.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No permissions configured</div>
                  ) : (
                    data.rules.map((rule: Rule) => {
                      const availableRules = Object.entries(getOperationsForResourceType(rule.resourceType)).length;
                      const enabledOperations = Object.entries(rule.operations).map(([op, value]: [string, any]) => ({
                        name: formatLabel(op),
                        originName: op,
                        value,
                      }));

                      // Check if all operations have the same permission
                      const allAllow =
                        enabledOperations.length > 0 &&
                        availableRules === enabledOperations.length &&
                        enabledOperations.every((op) => op.value === 'allow');
                      const allDeny =
                        enabledOperations.length > 0 &&
                        availableRules === enabledOperations.length &&
                        enabledOperations.every((op) => op.value === 'deny');
                      const showSummary = allAllow || allDeny;

                      return (
                        <div
                          key={rule.id}
                          className="border border-gray-200 rounded-lg p-4 space-y-3"
                          data-testid={`summary-card-${getRuleDataTestId(rule)}`}
                        >
                          <div className="mb-3">
                            <div className="font-medium text-gray-900">
                              {(() => {
                                const text =
                                  rule.resourceType === 'cluster' || rule.resourceType === 'schemaRegistry'
                                    ? getResourceName(rule.resourceType)
                                    : rule.selectorType === 'any'
                                      ? `All ${getPluralResourceName(rule.resourceType)}`
                                      : `${getPluralResourceName(rule.resourceType)} ${rule.selectorType === 'literal' ? 'matching' : 'starting with'}: "${rule.selectorValue}"`;
                                return text.charAt(0).toUpperCase() + text.slice(1);
                              })()}
                            </div>
                          </div>

                          {/* Operations */}
                          <div>
                            {enabledOperations.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {showSummary ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-1 text-xs rounded-full font-medium ${
                                      allAllow ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {allAllow ? 'Allow all' : 'Deny all'}
                                  </span>
                                ) : (
                                  enabledOperations.map((op) => (
                                    <span
                                      key={op.name}
                                      className={`inline-flex items-center px-2 py-1 text-xs rounded-full font-medium ${
                                        op.value === 'allow' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}
                                      data-testid={`detail-item-op-${getIdFromRule(rule, op.originName, op.value)}`}
                                    >
                                      {op.name}: {op.value}
                                    </span>
                                  ))
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No operations configured</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Matching Users */}
            {showMatchingUsers && (
              <MatchingUsersCard principalType={data.principalType} principal={sharedConfig.principal} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const EmbeddedAclDetail = ({ principal }: { principal: string }) => {
  const navigate = useNavigate();

  const { data } = useGetAclsByPrincipal(principal);

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <ACLDetails
      sharedConfig={data.sharedConfig}
      rules={data.rules}
      onUpdateACL={() => navigate(`/security/acls/${parsePrincipal(data.sharedConfig.principal).name}/update`)}
      isSimpleView={true}
    />
  );
};

export { EmbeddedAclDetail };
