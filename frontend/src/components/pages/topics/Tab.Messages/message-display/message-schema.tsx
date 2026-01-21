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

import { Link } from '@tanstack/react-router';
import { observer } from 'mobx-react';

import { api } from '../../../../../state/backend-api';

export const MessageSchema = observer((p: { schemaId: number }) => {
  const subjects = api.schemaUsagesById.get(p.schemaId);
  if (!subjects || subjects.length === 0) {
    api.refreshSchemaUsagesById(p.schemaId);
    return <>ID {p.schemaId} (unknown subject)</>;
  }

  const s = subjects[0];
  return (
    <Link
      params={{ subjectName: encodeURIComponent(s.subject) }}
      search={{ version: String(s.version) }}
      to="/schema-registry/subjects/$subjectName"
    >
      {s.subject} (version {s.version})
    </Link>
  );
});
