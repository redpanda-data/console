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

import AnthropicLogo from 'assets/anthropic.svg';
import GeminiLogo from 'assets/gemini.svg';
import OpenAILogo from 'assets/openai.svg';
import { Text } from 'components/redpanda-ui/components/typography';
import { cn } from 'components/redpanda-ui/lib/utils';

/**
 * Provider information with pattern matching for logo detection
 *
 * How to add a new provider:
 * 1. Import the provider's logo SVG from assets/
 * 2. Add a new entry with a pattern that matches all models from that provider
 * 3. The pattern will automatically detect any model matching the regex
 *
 * Example:
 * import AnthropicLogo from 'assets/anthropic.svg';
 * ...
 * anthropic: {
 *   label: 'Anthropic',
 *   icon: AnthropicLogo,
 *   modelPattern: /^(claude-)/i,
 * }
 */
export const PROVIDER_INFO = {
  openai: {
    label: 'OpenAI',
    icon: OpenAILogo,
    modelPattern: /^(gpt-|o1-|o3-|o4-)/i,
  },
  anthropic: {
    label: 'Anthropic',
    icon: AnthropicLogo,
    modelPattern: /^(claude-)/i,
  },
  google: {
    label: 'Google',
    icon: GeminiLogo,
    modelPattern: /^(gemini-)/i,
  },
} as const;

/**
 * Model options organized by provider (for dropdowns and documentation)
 *
 * This defines which models appear in the model selection dropdown in the create form.
 * Note: The AIAgentModel component will show logos for ANY model matching PROVIDER_INFO patterns,
 * even if not listed here. This list is only for the dropdown options.
 *
 * How to add a new provider to the dropdown:
 * 1. Ensure the provider is added to PROVIDER_INFO above
 * 2. Add a new entry here with the models you want to show in the dropdown
 *
 * Example:
 * anthropic: {
 *   label: 'Anthropic',
 *   icon: AnthropicLogo,
 *   models: [
 *     { value: 'claude-4-opus-20250219', name: 'Claude 4 Opus', description: 'Most capable model for advanced reasoning' },
 *   ],
 * }
 */
export const MODEL_OPTIONS_BY_PROVIDER = {
  openai: {
    /**
     * @see https://platform.openai.com/docs/models
     */
    label: 'OpenAI',
    icon: OpenAILogo,
    models: [
      {
        value: 'gpt-5',
        name: 'gpt-5',
        description: 'The best model for coding and agentic tasks across domains',
      },
      {
        value: 'gpt-5-mini',
        name: 'gpt-5-mini',
        description: 'A faster, cost-efficient version of gpt-5 for well-defined tasks',
      },
    ],
  },
  anthropic: {
    label: 'Anthropic',
    icon: AnthropicLogo,
    models: [
      {
        value: 'claude-sonnet-4-5',
        name: 'Claude Sonnet 4.5',
        description: 'Balanced intelligence and speed for most tasks',
      },
      {
        value: 'claude-opus-4-1',
        name: 'Claude Opus 4.1',
        description: 'Most capable for complex reasoning and analysis',
      },
      {
        value: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        description: 'Fast and cost-effective for simpler tasks',
      },
    ],
  },
  google: {
    label: 'Google',
    icon: GeminiLogo,
    models: [
      {
        value: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'High-capability model for complex tasks',
      },
      {
        value: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Fast and efficient for most use cases',
      },
      {
        value: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Proven performance and reliability',
      },
    ],
  },
} as const;

type AIAgentModelProps = {
  model: string;
  className?: string;
  showLogo?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

/**
 * Detects the provider for a given model name using pattern matching
 * This allows the component to work with any model from supported providers,
 * not just the ones explicitly listed in MODEL_OPTIONS_BY_PROVIDER
 */
const detectProvider = (modelName: string): (typeof PROVIDER_INFO)[keyof typeof PROVIDER_INFO] | null => {
  for (const provider of Object.values(PROVIDER_INFO)) {
    if (provider.modelPattern.test(modelName)) {
      return provider;
    }
  }
  return null;
};

/**
 * Reusable component for displaying AI agent model with provider logo
 * Used in list page, details page, and create page
 *
 * @example
 * // Works with any OpenAI model
 * <AIAgentModel model="gpt-5" />
 * <AIAgentModel model="gpt-5-mini" />
 *
 * // Future: Works with Anthropic models when added
 * <AIAgentModel model="claude-4-opus" />
 */
export const AIAgentModel = ({ model, className, showLogo = true, size = 'md' }: AIAgentModelProps) => {
  // Detect provider using pattern matching
  const providerInfo = detectProvider(model);

  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const logoSize = sizeClasses[size];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {showLogo && providerInfo && <img alt={providerInfo.label} className={logoSize} src={providerInfo.icon} />}
      <Text className="font-mono" variant={size === 'sm' ? 'small' : 'default'}>
        {model}
      </Text>
    </div>
  );
};
