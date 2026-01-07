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
import { Field, FieldLabel, FieldDescription, FieldError } from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Textarea } from 'components/redpanda-ui/components/textarea';
import { Text } from 'components/redpanda-ui/components/typography';
import { MCPEmpty } from 'components/ui/mcp/mcp-empty';
import { MCPServerCardList } from 'components/ui/mcp/mcp-server-card';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, type Control, useFormState } from 'react-hook-form';
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

  const { errors } = useFormState({ control });

  const [expandedItem, setExpandedItem] = useState<string | undefined>(undefined);

  const handleAddSubagent = () => {
    const newIndex = fields.length;
    append({
      name: '',
      description: '',
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
                <div className="flex flex-1 items-center gap-2">
                  <Text className="font-medium">{field.name || `Subagent ${index + 1}`}</Text>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-4">
                  {/* Name input */}
                  <Field data-invalid={!!errors.subagents?.[index]?.name}>
                    <FieldLabel htmlFor={`subagent-name-${index}`} required>
                      Subagent Name
                    </FieldLabel>
                    <Controller
                      control={control}
                      name={`subagents.${index}.name`}
                      render={({ field: nameField }) => (
                        <Input
                          id={`subagent-name-${index}`}
                          placeholder="e.g., code-reviewer"
                          {...nameField}
                          aria-invalid={!!errors.subagents?.[index]?.name}
                        />
                      )}
                    />
                    {errors.subagents?.[index]?.name && (
                      <FieldError>{errors.subagents[index]?.name?.message}</FieldError>
                    )}
                  </Field>

                  {/* Description */}
                  <Field data-invalid={!!errors.subagents?.[index]?.description}>
                    <FieldLabel htmlFor={`subagent-description-${index}`}>Description</FieldLabel>
                    <Controller
                      control={control}
                      name={`subagents.${index}.description`}
                      render={({ field: descField }) => (
                        <Textarea
                          id={`subagent-description-${index}`}
                          placeholder="Brief description of this subagent's purpose..."
                          rows={2}
                          {...descField}
                          aria-invalid={!!errors.subagents?.[index]?.description}
                        />
                      )}
                    />
                    <FieldDescription>
                      Used by the parent agent to decide when to invoke this subagent. Also used for context
                      management - the parent provides context when starting the subagent, which maintains its own
                      context.
                    </FieldDescription>
                    {errors.subagents?.[index]?.description && (
                      <FieldError>{errors.subagents[index]?.description?.message}</FieldError>
                    )}
                  </Field>

                  {/* System prompt */}
                  <Field data-invalid={!!errors.subagents?.[index]?.systemPrompt}>
                    <FieldLabel htmlFor={`subagent-systemPrompt-${index}`} required>
                      System Prompt
                    </FieldLabel>
                    <Controller
                      control={control}
                      name={`subagents.${index}.systemPrompt`}
                      render={({ field: promptField }) => (
                        <Textarea
                          id={`subagent-systemPrompt-${index}`}
                          placeholder="Define the specialized behavior for this subagent..."
                          rows={6}
                          {...promptField}
                          aria-invalid={!!errors.subagents?.[index]?.systemPrompt}
                        />
                      )}
                    />
                    {errors.subagents?.[index]?.systemPrompt && (
                      <FieldError>{errors.subagents[index]?.systemPrompt?.message}</FieldError>
                    )}
                  </Field>

                  {/* MCP Servers */}
                  <Field data-invalid={!!errors.subagents?.[index]?.selectedMcpServers}>
                    <FieldLabel htmlFor={`subagent-mcpServers-${index}`}>MCP Servers</FieldLabel>
                    <FieldDescription>Select which MCP servers this subagent can access</FieldDescription>
                    <Controller
                      control={control}
                      name={`subagents.${index}.selectedMcpServers`}
                      render={({ field: mcpField }) =>
                        availableMcpServers.length > 0 ? (
                          <MCPServerCardList
                            idPrefix={`subagent-${index}`}
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
                        )
                      }
                    />
                    {errors.subagents?.[index]?.selectedMcpServers && (
                      <FieldError>{errors.subagents[index]?.selectedMcpServers?.message}</FieldError>
                    )}
                  </Field>

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
