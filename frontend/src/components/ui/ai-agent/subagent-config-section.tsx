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

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'components/redpanda-ui/components/accordion';
import { Button } from 'components/redpanda-ui/components/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from 'components/redpanda-ui/components/form';
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { MCPEmpty } from 'components/ui/mcp/mcp-empty';
import { MCPServerCardList } from 'components/ui/mcp/mcp-server-card';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Control } from 'react-hook-form';
import { useFieldArray } from 'react-hook-form';
import type { MCPServer } from 'react-query/api/remote-mcp';

import type { FormValues } from '../../pages/agents/create/schemas';

type SubagentConfigSectionProps = {
  control: Control<FormValues>;
  availableMcpServers: MCPServer[];
};

export const SubagentConfigSection = ({ control, availableMcpServers }: SubagentConfigSectionProps) => {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'subagents',
  });

  const [expandedItem, setExpandedItem] = useState<string | undefined>(undefined);

  const handleAddSubagent = () => {
    const newIndex = fields.length;
    append({
      name: '',
      systemPrompt: '',
      selectedMcpServers: [],
    });
    // Auto-expand the newly added subagent
    setExpandedItem(`subagent-${newIndex}`);
  };

  return (
    <div className="space-y-4">
      {/* Empty state */}
      {fields.length === 0 && (
        <div className="space-y-2 text-center">
          <Text variant="muted">
            No subagents configured. Subagents inherit the provider and model from the parent agent.
          </Text>
        </div>
      )}

      {/* Accordion for subagents */}
      {fields.length > 0 && (
        <Accordion collapsible onValueChange={setExpandedItem} type="single" value={expandedItem}>
          {fields.map((field, index) => (
            <AccordionItem key={field.id} value={`subagent-${index}`}>
              <AccordionTrigger>
                <FormField
                  control={control}
                  name={`subagents.${index}.name`}
                  render={({ field: nameField }) => {
                    const name = nameField.value || `Subagent ${index + 1}`;
                    return (
                      <div className="flex flex-1 items-center gap-2">
                        <Text className="font-medium">{name}</Text>
                      </div>
                    );
                  }}
                />
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-4">
                  {/* Name input */}
                  <FormField
                    control={control}
                    name={`subagents.${index}.name`}
                    render={({ field: nameField }) => (
                      <FormItem>
                        <FormLabel required>Subagent Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., code-reviewer" {...nameField} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* System prompt */}
                  <FormField
                    control={control}
                    name={`subagents.${index}.systemPrompt`}
                    render={({ field: promptField }) => (
                      <FormItem>
                        <FormLabel required>System Prompt</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Define the specialized behavior for this subagent..."
                            rows={6}
                            {...promptField}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* MCP Servers */}
                  <FormField
                    control={control}
                    name={`subagents.${index}.selectedMcpServers`}
                    render={({ field: mcpField }) => (
                      <FormItem>
                        <FormLabel>MCP Servers</FormLabel>
                        <Text className="text-muted-foreground text-sm" variant="muted">
                          Select which MCP servers this subagent can access
                        </Text>
                        <FormControl>
                          {availableMcpServers.length > 0 ? (
                            <MCPServerCardList
                              onValueChange={mcpField.onChange}
                              servers={availableMcpServers}
                              value={mcpField.value || []}
                            />
                          ) : (
                            <MCPEmpty>
                              <Text className="mb-4 text-center" variant="muted">
                                No MCP servers available. Create MCP servers to enable tools for this subagent.
                              </Text>
                            </MCPEmpty>
                          )}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Delete button */}
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => remove(index)} size="sm" type="button" variant="destructive">
                      <Trash2 className="h-4 w-4" />
                      Remove Subagent
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Add subagent button */}
      <Button className="w-full" onClick={handleAddSubagent} type="button" variant="dashed">
        <Plus className="h-4 w-4" />
        Add Subagent
      </Button>
    </div>
  );
};
