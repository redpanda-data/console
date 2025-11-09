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

import { Card, CardContent } from 'components/redpanda-ui/components/card';
import { Text } from 'components/redpanda-ui/components/typography';
import type { ShadowLink } from 'protogen/redpanda/api/console/v1alpha1/shadowlink_pb';

interface ShadowLinkDiagramProps {
  shadowLink: ShadowLink;
}

export const ShadowLinkDiagram = ({ shadowLink }: ShadowLinkDiagramProps) => {
  const bootstrapServers = shadowLink.configurations?.clientOptions?.bootstrapServers ?? [];

  return (
    <Card size="full">
      <CardContent>
        <div className="flex items-center justify-between">
          {/* Source Cluster */}
          <div className="flex min-w-[200px] flex-col gap-2 rounded border border-gray-300 bg-white px-4 py-3">
            <Text className="font-semibold">Source Cluster</Text>
            {bootstrapServers.length > 0 ? (
              <div className="space-y-1">
                {bootstrapServers.map((server, index) => (
                  <Text className="font-mono text-muted-foreground text-xs" key={index}>
                    {server}
                  </Text>
                ))}
              </div>
            ) : (
              <Text className="text-muted-foreground text-xs">No bootstrap servers</Text>
            )}
          </div>

          {/* Connection arrow */}
          <div className="flex flex-1 flex-col items-center justify-center px-6">
            <div className="relative my-2 h-px w-full bg-gray-400">
              <div className="-translate-y-1/2 absolute top-1/2 right-0 h-0 w-0 border-y-4 border-y-transparent border-l-8 border-l-gray-400" />
            </div>
          </div>

          {/* Shadow Cluster */}
          <div className="flex min-w-[200px] flex-col gap-2 rounded border border-gray-300 bg-white px-4 py-3">
            <Text className="font-semibold">Shadow cluster</Text>
            <Text className="text-muted-foreground text-xs">This cluster</Text>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Text className="text-xs">Shadow link:</Text>
                <Text className="font-mono text-xs">{shadowLink.name}</Text>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
