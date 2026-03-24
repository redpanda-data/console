/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Badge } from 'components/redpanda-ui/components/badge';
import { TranscriptStatus } from 'protogen/redpanda/api/dataplane/v1alpha3/transcript_pb';

export const ConversationStatusBadge = ({ status }: { status: TranscriptStatus }) => {
  if (status === TranscriptStatus.COMPLETED) {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600" variant="outline">
        Completed
      </Badge>
    );
  }
  if (status === TranscriptStatus.ERROR) {
    return (
      <Badge className="border-red-500/30 bg-red-500/10 text-red-600" variant="outline">
        Error
      </Badge>
    );
  }
  if (status === TranscriptStatus.RUNNING) {
    return (
      <Badge className="border-blue-500/30 bg-blue-500/10 text-blue-600" variant="outline">
        Running
      </Badge>
    );
  }
  return <Badge variant="outline">Unknown</Badge>;
};
