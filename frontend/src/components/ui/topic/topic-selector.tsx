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

'use client';

import { useAsyncOptions } from '@ui-sdk/react/async-options';
import { Button } from 'components/redpanda-ui/components/button';
import {
  MultiSelect,
  MultiSelectContent,
  MultiSelectEmpty,
  MultiSelectItem,
  MultiSelectList,
  MultiSelectSearch,
  MultiSelectStatus,
  MultiSelectTrigger,
  MultiSelectValue,
} from 'components/redpanda-ui/components/multi-select';
import { useTopicOptionsLoader } from 'react-query/api/topic-options';

type TopicSelectorProps = {
  selectedTopics: string[];
  onTopicsChange: (topics: string[]) => void;
  isReadOnly?: boolean;
  'aria-label'?: string;
};

function TopicTrigger({ label, loading = false }: { label: string; loading?: boolean }) {
  return (
    <MultiSelectTrigger aria-label={label} className="w-full">
      <MultiSelectValue placeholder={loading ? 'Loading topics...' : 'Select topics...'} />
    </MultiSelectTrigger>
  );
}

function SearchableTopicSelector({
  selectedTopics,
  onTopicsChange,
  'aria-label': label = 'Topics',
}: TopicSelectorProps) {
  const load = useTopicOptionsLoader();
  const search = useAsyncOptions(load, { immediate: true });
  const loading = search.status === 'loading';
  return (
    <MultiSelect
      filter={false}
      items={search.items.map((name) => ({ value: name, label: name }))}
      onSearch={(query) => search.setQuery(query ?? '')}
      onValueChange={onTopicsChange}
      query={search.query}
      status={search.status}
      value={selectedTopics}
    >
      <TopicTrigger label={label} loading={loading} />
      <MultiSelectContent keepMounted={false}>
        <MultiSelectSearch placeholder="Search topics (case-sensitive)..." />
        <MultiSelectList>
          {search.items.map((topic) => (
            <MultiSelectItem key={topic} value={topic}>
              {topic}
            </MultiSelectItem>
          ))}
        </MultiSelectList>
        {search.status === 'idle' && !search.hasMore ? <MultiSelectEmpty>No topics found</MultiSelectEmpty> : null}
        <MultiSelectStatus>
          {search.status === 'error' && (
            <>
              Could not load topics.
              <Button aria-label="Retry topic search" onClick={search.reload} size="sm" type="button" variant="ghost">
                Retry
              </Button>
            </>
          )}
          {loading && 'Searching topics...'}
        </MultiSelectStatus>
        {search.hasMore && search.status !== 'error' ? (
          <Button disabled={loading} onClick={search.loadMore} size="sm" type="button" variant="ghost">
            Load more topics
          </Button>
        ) : null}
      </MultiSelectContent>
    </MultiSelect>
  );
}

export function TopicSelector({
  selectedTopics,
  onTopicsChange,
  isReadOnly,
  'aria-label': label = 'Topics',
}: TopicSelectorProps) {
  if (!isReadOnly) {
    return (
      <SearchableTopicSelector aria-label={label} onTopicsChange={onTopicsChange} selectedTopics={selectedTopics} />
    );
  }
  return (
    <MultiSelect disabled onValueChange={onTopicsChange} value={selectedTopics}>
      <TopicTrigger label={label} />
    </MultiSelect>
  );
}
