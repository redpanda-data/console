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

import { Edit, Plus, Save, Settings, Trash2 } from 'lucide-react';
import React, { useEffect } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { Button } from '../../../redpanda-ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../redpanda-ui/components/card';
import { DynamicCodeBlock } from '../../../redpanda-ui/components/code-block-dynamic';
import { Field, FieldError, FieldLabel } from '../../../redpanda-ui/components/field';
import { FormItem, FormLabel } from '../../../redpanda-ui/components/form';
import { Input } from '../../../redpanda-ui/components/input';
import { Textarea } from '../../../redpanda-ui/components/textarea';
import { Heading, Text } from '../../../redpanda-ui/components/typography';

type KnowledgeBaseUpdateForm = KnowledgeBaseUpdate & {
  indexer?: KnowledgeBaseUpdate['indexer'] & {
    exactTopics?: string[];
    regexPatterns?: string[];
  };
};

type BasicInfoSectionProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => Promise<void>;
  formHasChanges: boolean;
  isUpdating: boolean;
};

const hasDuplicateKeys = (tags: Array<{ key: string; value: string }>) => {
  const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
  return keys.length !== new Set(keys).size;
};

const getDuplicateKeys = (tags: Array<{ key: string; value: string }>) => {
  const keys = tags.map((tag) => tag.key.trim()).filter((key) => key !== '');
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  return new Set(duplicates);
};

export const BasicInfoSection = ({
  knowledgeBase,
  isEditMode,
  onStartEdit,
  onCancelEdit,
  onSave,
  formHasChanges,
  isUpdating,
}: BasicInfoSectionProps) => {
  const { control, setValue } = useFormContext<KnowledgeBaseUpdateForm>();

  // Store editable tags in local state, independent from form state
  const [editableTags, setEditableTags] = React.useState<Array<{ key: string; value: string }>>([]);

  // Initialize editableTags from knowledgeBase.tags when component mounts or knowledgeBase changes
  useEffect(() => {
    if (knowledgeBase.tags && typeof knowledgeBase.tags === 'object') {
      const newTagsArray = Object.entries(knowledgeBase.tags).map(([key, value]) => ({ key, value }));
      setEditableTags(newTagsArray);
    } else {
      setEditableTags([]);
    }
  }, [knowledgeBase]);

  // Serialize editableTags to form state whenever they change
  // Only include tags with both key and value filled
  useEffect(() => {
    const tagsMap: Record<string, string> = {};
    for (const tag of editableTags) {
      // Only include tags where both key and value are non-empty
      if (tag.key.trim() && tag.value.trim()) {
        tagsMap[tag.key.trim()] = tag.value.trim();
      }
    }
    setValue('tags', tagsMap, { shouldDirty: true });
  }, [editableTags, setValue]);

  return (
    <Card className="px-0 py-0" size="full">
      <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <Text className="font-semibold">Knowledge Base Configuration</Text>
          </CardTitle>
          <div className="flex gap-2">
            {isEditMode ? (
              <>
                <Button disabled={!formHasChanges || isUpdating} onClick={onSave} variant="secondary">
                  <Save className="h-4 w-4" />
                  Save Changes
                </Button>
                <Button onClick={onCancelEdit} variant="outline">
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={onStartEdit} variant="secondary">
                <Edit className="h-4 w-4" />
                Edit Configuration
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <FormLabel>ID</FormLabel>
            <DynamicCodeBlock code={knowledgeBase.id} lang="text" />
          </div>

          {isEditMode ? (
            <Controller
              control={control}
              name="displayName"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Display Name</FieldLabel>
                  <Input {...field} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          ) : (
            <FormItem>
              <FormLabel>Display Name</FormLabel>
              <Input disabled value={knowledgeBase.displayName} />
            </FormItem>
          )}

          {isEditMode ? (
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Description</FieldLabel>
                  <Textarea {...field} rows={3} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          ) : (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <Textarea disabled rows={3} value={knowledgeBase.description} />
            </FormItem>
          )}

          <div className="space-y-2">
            <FormLabel>Retrieval API URL</FormLabel>
            <p className="text-muted-foreground text-sm">
              This URL is automatically generated by the system for accessing the knowledge base.
            </p>
            <DynamicCodeBlock code={knowledgeBase.retrievalApiUrl} lang="text" />
          </div>

          {(editableTags.length > 0 || isEditMode) && (
            <div className="flex flex-col gap-2 space-y-4">
              <Heading className="font-medium text-sm" level={4}>
                Tags
              </Heading>
              <div className="space-y-2">
                {isEditMode && hasDuplicateKeys(editableTags) && (
                  <Text className="text-destructive" variant="small">
                    Tags must have unique keys
                  </Text>
                )}
                {editableTags.map((tag, index) => {
                  const duplicateKeys = isEditMode ? getDuplicateKeys(editableTags) : new Set();
                  const isDuplicateKey = tag.key.trim() !== '' && duplicateKeys.has(tag.key.trim());
                  return (
                    <div className="flex items-center gap-2" key={`tag-${index}`}>
                      <div className="flex-1">
                        <Input
                          className={isDuplicateKey ? 'border-destructive focus:border-destructive' : ''}
                          disabled={!isEditMode}
                          onChange={(e) => {
                            const newTags = [...editableTags];
                            newTags[index] = { ...newTags[index], key: e.target.value };
                            setEditableTags(newTags);
                          }}
                          placeholder="Key"
                          value={tag.key}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          disabled={!isEditMode}
                          onChange={(e) => {
                            const newTags = [...editableTags];
                            newTags[index] = { ...newTags[index], value: e.target.value };
                            setEditableTags(newTags);
                          }}
                          placeholder="Value"
                          value={tag.value}
                        />
                      </div>
                      {isEditMode && (
                        <div className="flex h-9 items-end">
                          <Button
                            onClick={() => {
                              const newTags = editableTags.filter((_, i) => i !== index);
                              setEditableTags(newTags);
                            }}
                            size="sm"
                            variant="outline"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {isEditMode && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      setEditableTags([...editableTags, { key: '', value: '' }]);
                    }}
                    variant="dashed"
                  >
                    <Plus className="h-4 w-4" />
                    Add Tag
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
