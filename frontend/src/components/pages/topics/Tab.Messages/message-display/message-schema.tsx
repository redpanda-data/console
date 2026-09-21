/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Link } from '@tanstack/react-router';

import { api, useApiStoreHook } from '../../../../../state/backend-api';
import { pickSubjectForContext, topicSchemaContext } from '../../../schemas/schema-context-utils';

export const MessageSchema = (p: { schemaId: number; topicName?: string }) => {
  const subjects = useApiStoreHook((state) => state.schemaUsagesById.get(p.schemaId));
  const topicConfig = useApiStoreHook((state) => (p.topicName ? state.topicConfig.get(p.topicName) : undefined));
  if (!subjects || subjects.length === 0) {
    api.refreshSchemaUsagesById(p.schemaId);
    return <>ID {p.schemaId} (unknown subject)</>;
  }

  // The same schema ID can name different schemas in different contexts.
  const s = pickSubjectForContext(subjects, topicSchemaContext(topicConfig?.configEntries)) ?? subjects[0];
  return (
    <Link
      params={{ subjectName: encodeURIComponent(s.subject) }}
      search={{ version: String(s.version) }}
      to="/schema-registry/subjects/$subjectName"
    >
      {s.subject} (version {s.version})
    </Link>
  );
};
