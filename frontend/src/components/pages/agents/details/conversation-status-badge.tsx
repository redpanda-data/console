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
      <Badge className="border-outline-success/30 bg-background-success-strong/10 text-success" variant="outline">
        Completed
      </Badge>
    );
  }
  if (status === TranscriptStatus.ERROR) {
    return (
      <Badge className="border-outline-error/30 bg-background-error-strong/10 text-error" variant="outline">
        Error
      </Badge>
    );
  }
  if (status === TranscriptStatus.RUNNING) {
    return (
      <Badge
        className="border-outline-informative/30 bg-background-informative-strong/10 text-informative"
        variant="outline"
      >
        Running
      </Badge>
    );
  }
  return <Badge variant="outline">Unknown</Badge>;
};
