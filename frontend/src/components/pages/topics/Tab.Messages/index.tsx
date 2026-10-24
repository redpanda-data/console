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

import '../../../../utils/array-extensions';
import { ErrorIcon } from 'components/icons';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { Button } from 'components/redpanda-ui/components/button';
import { parseAsString, useQueryState } from 'nuqs';
import type { FC } from 'react';

import { useMessageSearch } from './hooks/use-message-search';
import {
  useMessagePagingParams,
  useMessageQueryParams,
  useMessageViewDialogs,
  useTopicFilters,
  useTopicViewSettings,
} from './hooks/use-message-view-params';
import { MessageSearchControls } from './message-search-controls';
import { MessagesResults } from './messages-results';
import type { Topic } from '../../../../state/rest-interfaces';

type TopicMessageViewProps = {
  topic: Topic;
  refreshTopicData: (force: boolean) => void;
};

/*
    TODO:
        - when the user has entered a specific offset, we should prevent selecting 'all' partitions, as that wouldn't make any sense.
        - add back summary of quick search  <this.FilterSummary />
*/

export const TopicMessageView: FC<TopicMessageViewProps> = ({ topic }) => {
  const settings = useTopicViewSettings(topic.topicName);
  const query = useMessageQueryParams(topic.topicName);
  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));
  const [filters, setFilters] = useTopicFilters(topic.topicName);
  const paging = useMessagePagingParams(topic.topicName, query.maxResults);
  const search = useMessageSearch({ topicName: topic.topicName, query, paging, filters });
  const dialogs = useMessageViewDialogs();

  return (
    <>
      <MessageSearchControls
        dialogs={dialogs}
        filters={filters}
        paging={paging}
        query={query}
        quickSearch={quickSearch}
        search={search}
        setFilters={setFilters}
        setQuickSearch={setQuickSearch}
        settings={settings}
        topic={topic}
      />
      {/* Message Table (or error display) */}
      {search.fetchError ? (
        <Alert icon={<ErrorIcon />} variant="destructive">
          <AlertTitle>Backend Error</AlertTitle>
          <AlertDescription>
            <div>Check and modify the request before resubmitting.</div>
            <div className="mt-4">
              <div className="codeBox">{search.fetchError.message}</div>
            </div>
            <Button className="mt-4" onClick={() => search.executeMessageSearch()}>
              Retry Search
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <MessagesResults
          dialogs={dialogs}
          filtersCount={filters.length}
          paging={paging}
          query={query}
          quickSearch={quickSearch}
          search={search}
          settings={settings}
          topic={topic}
        />
      )}
    </>
  );
};
