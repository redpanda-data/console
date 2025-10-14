/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Button } from 'components/redpanda-ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Text } from 'components/redpanda-ui/components/typography';
import { Plus, X } from 'lucide-react';
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import type { UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';

import type { FormValues } from './schemas';

interface AclsStepProps {
  form: UseFormReturn<FormValues>;
  aclFiltersFields: UseFieldArrayReturn<FormValues, 'aclFilters', 'id'>['fields'];
  appendAclFilter: UseFieldArrayReturn<FormValues, 'aclFilters', 'id'>['append'];
  removeAclFilter: UseFieldArrayReturn<FormValues, 'aclFilters', 'id'>['remove'];
}

const defaultAclFilter = {
  resourceType: ACLResource.ACL_RESOURCE_ANY,
  resourcePattern: ACLPattern.ACL_PATTERN_ANY,
  resourceName: '',
  principal: '',
  operation: ACLOperation.ACL_OPERATION_ANY,
  permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
  host: '',
};

export const AclsStep = ({ form, aclFiltersFields, appendAclFilter, removeAclFilter }: AclsStepProps) => {
  return (
    <div className="space-y-4">
      <Card size="full">
        <CardHeader>
          <CardTitle>ACLs to Mirror</CardTitle>
          <CardDescription>Configure ACL filters to control which access control lists are replicated</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Empty state */}
            {aclFiltersFields.length === 0 && (
              <div className="py-8 text-center">
                <Text className="mb-4" variant="muted">
                  No ACL filters configured. Click "Add ACL Filter" to create one, or leave empty to skip ACL mirroring.
                </Text>
              </div>
            )}

            {/* Render each ACL filter */}
            {aclFiltersFields.map((field, index) => (
              <Card className="w-full border" key={field.id} size="full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">ACL Filter {index + 1}</CardTitle>
                    <Button onClick={() => removeAclFilter(index)} size="sm" type="button" variant="destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Resource Filter - Full Width */}
                  <div>
                    <h5 className="border-b pb-3 font-medium text-sm">Resource Filter</h5>
                    <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-4">
                      <FormField
                        control={form.control}
                        name={`aclFilters.${index}.resourceType`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Resource Type</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(Number(v))}
                              value={field.value !== undefined ? String(field.value) : undefined}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={String(ACLResource.ACL_RESOURCE_ANY)}>Any</SelectItem>
                                <SelectItem value={String(ACLResource.ACL_RESOURCE_TOPIC)}>Topic</SelectItem>
                                <SelectItem value={String(ACLResource.ACL_RESOURCE_GROUP)}>Consumer Group</SelectItem>
                                <SelectItem value={String(ACLResource.ACL_RESOURCE_CLUSTER)}>Cluster</SelectItem>
                                <SelectItem value={String(ACLResource.ACL_RESOURCE_TXN_ID)}>Transaction ID</SelectItem>
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
                        control={form.control}
                        name={`aclFilters.${index}.resourcePattern`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pattern Type</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(Number(v))}
                              value={field.value !== undefined ? String(field.value) : undefined}
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
                        control={form.control}
                        name={`aclFilters.${index}.resourceName`}
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>Resource Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Leave empty for all" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Access Filter - Full Width */}
                  <div>
                    <h5 className="border-b pb-3 font-medium text-sm">Access Filter</h5>
                    <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-4">
                      <FormField
                        control={form.control}
                        name={`aclFilters.${index}.principal`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Principal</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., User:alice (leave empty for all)" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`aclFilters.${index}.operation`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operation</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(Number(v))}
                              value={field.value !== undefined ? String(field.value) : undefined}
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
                                <SelectItem value={String(ACLOperation.ACL_OPERATION_DESCRIBE)}>Describe</SelectItem>
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
                        control={form.control}
                        name={`aclFilters.${index}.permissionType`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Permission Type</FormLabel>
                            <Select
                              onValueChange={(v) => field.onChange(Number(v))}
                              value={field.value !== undefined ? String(field.value) : undefined}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select permission" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={String(ACLPermissionType.ACL_PERMISSION_TYPE_ANY)}>Any</SelectItem>
                                <SelectItem value={String(ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW)}>
                                  Allow
                                </SelectItem>
                                <SelectItem value={String(ACLPermissionType.ACL_PERMISSION_TYPE_DENY)}>Deny</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`aclFilters.${index}.host`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Host</FormLabel>
                            <FormControl>
                              <Input placeholder="Leave empty for all hosts" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => appendAclFilter(defaultAclFilter)} size="sm" type="button" variant="outline">
        <Plus className="mr-2 h-4 w-4" />
        Add ACL Filter
      </Button>
    </div>
  );
};
