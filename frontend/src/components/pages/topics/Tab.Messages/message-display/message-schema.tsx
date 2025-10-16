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

import { Link } from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink } from 'react-router-dom';

import { api } from '../../../../../state/backend-api';

export const MessageSchema = observer((p: { schemaId: number }) => {
  const subjects = api.schemaUsagesById.get(p.schemaId);
  if (!subjects || subjects.length === 0) {
    api.refreshSchemaUsagesById(p.schemaId);
    return <>ID {p.schemaId} (unknown subject)</>;
  }

  const s = subjects[0];
  return (
    <Link as={ReactRouterLink} to={`/schema-registry/subjects/${encodeURIComponent(s.subject)}?version=${s.version}`}>
      {s.subject} (version {s.version})
    </Link>
  );
});
