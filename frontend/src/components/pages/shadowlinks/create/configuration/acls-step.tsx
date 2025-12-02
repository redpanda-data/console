/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Alert, AlertDescription } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'components/redpanda-ui/components/collapsible';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { ChevronDown, Info, X } from 'lucide-react';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { ACLFilterResume } from './acl-filter-resume';
import type { FormValues } from '../model';

const allAclsFilter = {
  resourceType: ACLResource.ACL_RESOURCE_ANY,
  resourcePattern: ACLPattern.ACL_PATTERN_ANY,
  resourceName: '',
  principal: '',
  operation: ACLOperation.ACL_OPERATION_ANY,
  permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
  host: '',
};

// ACL Filter Alert Component
const ACLFilterAlert = ({ index }: { index: number }) => {
  const { control } = useFormContext<FormValues>();

  const resourceType = useWatch({ control, name: `aclFilters.${index}.resourceType` });
  const resourcePattern = useWatch({ control, name: `aclFilters.${index}.resourcePattern` });
  const resourceName = useWatch({ control, name: `aclFilters.${index}.resourceName` });
  const principal = useWatch({ control, name: `aclFilters.${index}.principal` });
  const operation = useWatch({ control, name: `aclFilters.${index}.operation` });
  const permissionType = useWatch({ control, name: `aclFilters.${index}.permissionType` });
  const host = useWatch({ control, name: `aclFilters.${index}.host` });

  const showMatchAllMessage =
    resourceType === ACLResource.ACL_RESOURCE_ANY &&
    resourcePattern === ACLPattern.ACL_PATTERN_ANY &&
    (resourceName === '' || resourceName === undefined) &&
    (principal === '' || principal === undefined) &&
    operation === ACLOperation.ACL_OPERATION_ANY &&
    permissionType === ACLPermissionType.ACL_PERMISSION_TYPE_ANY &&
    (host === '' || host === undefined);

  if (!showMatchAllMessage) {
    return null;
  }

  return (
    <Alert variant="warning">
      <Info className="h-4 w-4" />
      <AlertDescription>This filter will match all ACLs.</AlertDescription>
    </Alert>
  );
};

export const AclsStep = () => {
  const { control, setValue } = useFormContext<FormValues>();
  const [isOpen, setIsOpen] = useState(false);

  const aclsMode = useWatch({ control, name: 'aclsMode' });
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'aclFilters',
  });

  const handleModeChange = (mode: string) => {
    setValue('aclsMode', mode as 'all' | 'specify');

    // Auto-expand when switching to specify mode
    if (mode === 'specify') {
      setIsOpen(true);
    }

    if (mode === 'specify' && fields.length === 0) {
      // Add an empty filter when switching to specify mode
      append(allAclsFilter);
    }
  };

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <Card className="gap-0" size="full">
        <CardHeader>
          <CardTitle>Shadow ACLs</CardTitle>
          <CardAction>
            <CollapsibleTrigger asChild>
              <Button className="w-fit p-0" data-testid="acls-toggle-button" size="sm" variant="ghost">
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Tabs onValueChange={handleModeChange} value={aclsMode}>
            <TabsList variant="default">
              <TabsTrigger data-testid="acls-all-tab" value="all">
                All ACLs
              </TabsTrigger>
              <TabsTrigger data-testid="acls-specify-tab" value="specify">
                Specify ACLs
              </TabsTrigger>
            </TabsList>

            {/* Resume/summary view when collapsed */}
            {!isOpen && aclsMode === 'specify' && fields.length > 0 && (
              <div className="mt-4 space-y-3">
                {fields.map((field, index) => (
                  <ACLFilterResume index={index} key={field.id} />
                ))}
              </div>
            )}

            {/* Full editable view when expanded */}
            <CollapsibleContent>
              <TabsContent value="all">
                <Alert>
                  <AlertDescription>
                    All ACLs from the source cluster will be synchronized to the destination cluster.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="specify">
                <div className="space-y-4" data-testid="acl-filters-container">
                  {fields.map((field, index) => (
                    <Card data-testid={`acl-filter-${index}`} key={field.id} size="full" variant="elevated">
                      <CardHeader>
                        <CardTitle className="text-base">ACL filter {index + 1}</CardTitle>
                        <CardAction>
                          <Button
                            data-testid={`delete-acl-filter-${index}`}
                            onClick={() => remove(index)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Resource Filter - Full Width */}
                        <div>
                          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-4">
                            <FormField
                              control={control}
                              name={`aclFilters.${index}.resourceType`}
                              render={({ field: resourceTypeField }) => (
                                <FormItem data-testid={`acl-filter-${index}-resource-type`}>
                                  <FormLabel>Resource type</FormLabel>
                                  <Select
                                    onValueChange={(v) => resourceTypeField.onChange(Number(v))}
                                    value={
                                      resourceTypeField.value !== undefined
                                        ? String(resourceTypeField.value)
                                        : undefined
                                    }
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_ANY)}>Any</SelectItem>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_TOPIC)}>Topic</SelectItem>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_GROUP)}>
                                        Consumer Group
                                      </SelectItem>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_CLUSTER)}>Cluster</SelectItem>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_TXN_ID)}>
                                        Transaction ID
                                      </SelectItem>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_SR_SUBJECT)}>
                                        Schema Registry Subject
                                      </SelectItem>
                                      <SelectItem value={String(ACLResource.ACL_RESOURCE_SR_REGISTRY)}>
                                        Schema Registry
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={control}
                              name={`aclFilters.${index}.resourcePattern`}
                              render={({ field: resourcePatternField }) => (
                                <FormItem>
                                  <FormLabel>Pattern Type</FormLabel>
                                  <Select
                                    onValueChange={(v) => resourcePatternField.onChange(Number(v))}
                                    value={
                                      resourcePatternField.value !== undefined
                                        ? String(resourcePatternField.value)
                                        : undefined
                                    }
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select pattern" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value={String(ACLPattern.ACL_PATTERN_ANY)}>Any</SelectItem>
                                      <SelectItem value={String(ACLPattern.ACL_PATTERN_LITERAL)}>Literal</SelectItem>
                                      <SelectItem value={String(ACLPattern.ACL_PATTERN_PREFIXED)}>Prefixed</SelectItem>
                                      <SelectItem value={String(ACLPattern.ACL_PATTERN_MATCH)}>Match</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={control}
                              name={`aclFilters.${index}.resourceName`}
                              render={({ field: resourceNameField }) => (
                                <FormItem className="md:col-span-2">
                                  <FormLabel>Resource name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="All" {...resourceNameField} />
                                  </FormControl>
                                  <FormDescription>Empty matches all resources</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {/* Access Filter - Full Width */}
                        <div>
                          <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-4">
                            <FormField
                              control={control}
                              name={`aclFilters.${index}.principal`}
                              render={({ field: principalField }) => (
                                <FormItem>
                                  <FormLabel>Principal</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="All"
                                      testId={`acl-filter-${index}-principal`}
                                      {...principalField}
                                    />
                                  </FormControl>
                                  <FormDescription>Empty matches all principals</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={control}
                              name={`aclFilters.${index}.operation`}
                              render={({ field: operationField }) => (
                                <FormItem>
                                  <FormLabel>Operation</FormLabel>
                                  <Select
                                    onValueChange={(v) => operationField.onChange(Number(v))}
                                    value={
                                      operationField.value !== undefined ? String(operationField.value) : undefined
                                    }
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select operation" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_ANY)}>Any</SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_READ)}>Read</SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_WRITE)}>Write</SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_CREATE)}>Create</SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_REMOVE)}>Remove</SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_ALTER)}>Alter</SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_DESCRIBE)}>
                                        Describe
                                      </SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_CLUSTER_ACTION)}>
                                        Cluster Action
                                      </SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_DESCRIBE_CONFIGS)}>
                                        Describe Configs
                                      </SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_ALTER_CONFIGS)}>
                                        Alter Configs
                                      </SelectItem>
                                      <SelectItem value={String(ACLOperation.ACL_OPERATION_IDEMPOTENT_WRITE)}>
                                        Idempotent Write
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={control}
                              name={`aclFilters.${index}.permissionType`}
                              render={({ field: permissionTypeField }) => (
                                <FormItem>
                                  <FormLabel>Permission Type</FormLabel>
                                  <Select
                                    onValueChange={(v) => permissionTypeField.onChange(Number(v))}
                                    value={
                                      permissionTypeField.value !== undefined
                                        ? String(permissionTypeField.value)
                                        : undefined
                                    }
                                  >
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select permission" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value={String(ACLPermissionType.ACL_PERMISSION_TYPE_ANY)}>
                                        Any
                                      </SelectItem>
                                      <SelectItem value={String(ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW)}>
                                        Allow
                                      </SelectItem>
                                      <SelectItem value={String(ACLPermissionType.ACL_PERMISSION_TYPE_DENY)}>
                                        Deny
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={control}
                              name={`aclFilters.${index}.host`}
                              render={({ field: hostField }) => (
                                <FormItem>
                                  <FormLabel>Host</FormLabel>
                                  <FormControl>
                                    <Input placeholder="All" {...hostField} />
                                  </FormControl>
                                  <FormDescription>Empty matches all hosts</FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        <ACLFilterAlert index={index} />
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    data-testid="add-acl-filter-button"
                    onClick={() => append(allAclsFilter)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Add filter
                  </Button>
                </div>
              </TabsContent>
            </CollapsibleContent>
          </Tabs>
        </CardContent>
      </Card>
    </Collapsible>
  );
};
