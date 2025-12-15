/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file licenses/BSL.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

export interface EmbeddingModel {
  name: string;
  dimensions: number;
  description: string;
  provider: 'openai' | 'cohere';
}

export interface RerankerModel {
  name: string;
  description: string;
}

/**
 * Cohere embedding models
 * @see https://docs.cohere.com/docs/cohere-embed
 */
export const COHERE_MODELS: EmbeddingModel[] = [
  {
    name: 'embed-v4.0',
    dimensions: 1536,
    description: 'Supports text and images for classification and embeddings with state-of-the-art performance',
    provider: 'cohere',
  },
  {
    name: 'embed-english-v3.0',
    dimensions: 1024,
    description: 'Text classification and embeddings for English content only',
    provider: 'cohere',
  },
  {
    name: 'embed-english-light-v3.0',
    dimensions: 384,
    description: 'Faster, lighter version of embed-english-v3.0 with comparable performance. English only',
    provider: 'cohere',
  },
  {
    name: 'embed-multilingual-v3.0',
    dimensions: 1024,
    description: 'Multilingual classification and embeddings support across 100+ languages',
    provider: 'cohere',
  },
  {
    name: 'embed-multilingual-light-v3.0',
    dimensions: 384,
    description: 'Faster, lighter version of embed-multilingual-v3.0 with comparable performance',
    provider: 'cohere',
  },
];

/**
 * OpenAI embedding models
 * @see https://platform.openai.com/docs/guides/embeddings#embedding-models
 */
export const OPENAI_MODELS: EmbeddingModel[] = [
  {
    name: 'text-embedding-3-small',
    dimensions: 1536,
    description: 'Highly efficient embedding model optimized for cost and performance',
    provider: 'openai',
  },
  {
    name: 'text-embedding-3-large',
    dimensions: 3072,
    description: 'Most powerful embedding model with enhanced accuracy for complex use cases',
    provider: 'openai',
  },
];

/**
 * All embedding models combined (for unified dropdown)
 */
export const ALL_EMBEDDING_MODELS: EmbeddingModel[] = [...OPENAI_MODELS, ...COHERE_MODELS];

/**
 * Detect provider from model name
 */
export const detectEmbeddingProvider = (modelName: string): 'openai' | 'cohere' | null => {
  const model = ALL_EMBEDDING_MODELS.find((m) => m.name === modelName);
  return model?.provider ?? null;
};

/**
 * Cohere reranker models
 * @see https://docs.cohere.com/docs/rerank
 */
export const COHERE_RERANKER_MODELS: RerankerModel[] = [
  {
    name: 'rerank-v3.5',
    description:
      'State-of-the-art multilingual reranking for documents and JSON. Supports 100+ languages. Context: 4096 tokens',
  },
  {
    name: 'rerank-english-v3.0',
    description: 'Optimized for English documents and semi-structured data (JSON). Context: 4096 tokens',
  },
  {
    name: 'rerank-multilingual-v3.0',
    description:
      'Multilingual reranking for non-English documents and JSON. Supports 100+ languages. Context: 4096 tokens',
  },
];
