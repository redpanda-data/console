/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';

/**
 * Base props shared by most tab components
 */
export type BaseTabProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  formData: KnowledgeBaseUpdate;
  onUpdateFormData: (path: string, value: unknown) => void;
};

/**
 * Props for tabs that need secret management
 */
export type TabPropsWithSecrets = BaseTabProps & {
  onOpenAddSecret: (fieldName: string) => void;
};

/**
 * Props for GeneralTab with tag management
 */
export type GeneralTabProps = BaseTabProps & {
  validationErrors: Record<string, string>;
  tagsArray: Array<{ key: string; value: string }>;
  onAddTag: () => void;
  onRemoveTag: (index: number) => void;
  onUpdateTag: (index: number, field: 'key' | 'value', value: string) => void;
};

/**
 * Props for PlaygroundTab (independent component)
 */
export type PlaygroundTabProps = {
  knowledgeBase: KnowledgeBase;
};

export type ValidationErrors = Record<string, string>;
