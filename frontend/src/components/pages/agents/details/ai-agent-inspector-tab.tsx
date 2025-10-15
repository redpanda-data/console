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

import { Card, CardContent, CardHeader, CardTitle } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import { Search } from 'lucide-react';

export const AIAgentInspectorTab = () => (
  <Card className="px-0 py-0" size="full">
    <CardHeader className="border-b p-4 dark:border-border [.border-b]:pb-4">
      <CardTitle className="flex items-center gap-2">
        <Search className="h-4 w-4" />
        <Text className="font-semibold">AI Agent Inspector</Text>
      </CardTitle>
    </CardHeader>
    <CardContent className="px-4 pb-4">
      <div className="flex flex-col items-center justify-center py-12">
        <Text className="text-center text-muted-foreground" variant="default">
          Inspector functionality coming soon.
        </Text>
        <Text className="text-center text-muted-foreground" variant="small">
          Test your AI agent by sending messages and viewing responses.
        </Text>
      </div>
    </CardContent>
  </Card>
);
