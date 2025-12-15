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

import { BasicInfoSection } from './basic-info-section';
import { EmbeddingGeneratorSection } from './embedding-generator-section';
import { IndexerSection } from './indexer-section';
import { RetrieverSection } from './retriever-section';
import { VectorDatabaseSection } from './vector-database-section';
import type { KnowledgeBase } from '../../../../protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';

type KnowledgeBaseConfigurationTabProps = {
  knowledgeBase: KnowledgeBase;
  isEditMode: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => Promise<void>;
  formHasChanges: boolean;
  isUpdating: boolean;
};

export const KnowledgeBaseConfigurationTab = ({
  knowledgeBase,
  isEditMode,
  onStartEdit,
  onCancelEdit,
  onSave,
  formHasChanges,
  isUpdating,
}: KnowledgeBaseConfigurationTabProps) => {
  return (
    <div className="flex flex-col gap-6">
      {/* Basic Info Section */}
      <BasicInfoSection
        formHasChanges={formHasChanges}
        isEditMode={isEditMode}
        isUpdating={isUpdating}
        knowledgeBase={knowledgeBase}
        onCancelEdit={onCancelEdit}
        onSave={onSave}
        onStartEdit={onStartEdit}
      />

      {/* Vector Database Section */}
      <VectorDatabaseSection isEditMode={isEditMode} knowledgeBase={knowledgeBase} />

      {/* Embedding Generator Section */}
      <EmbeddingGeneratorSection isEditMode={isEditMode} knowledgeBase={knowledgeBase} />

      {/* Indexer Section */}
      <IndexerSection isEditMode={isEditMode} knowledgeBase={knowledgeBase} />

      {/* Retriever Section */}
      <RetrieverSection isEditMode={isEditMode} knowledgeBase={knowledgeBase} />
    </div>
  );
};
