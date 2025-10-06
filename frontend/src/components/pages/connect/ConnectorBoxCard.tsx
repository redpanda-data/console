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

import { Box, Flex, Link, Tag, TagLabel, Text } from '@redpanda-data/ui';

import { findConnectorMetadata, removeNamespace } from './helper';
import BoxCard, { type BoxCardProps } from '../../misc/BoxCard';
import type { HiddenRadioOption } from '../../misc/HiddenRadioList';

interface ConnectorBoxCardProps
  extends Omit<BoxCardProps, 'children'>,
    Omit<HiddenRadioOption<string>, 'render' | 'value'> {
  connectorPlugin: ConnectorPlugin;
  id?: string;
}

export function ConnectorBoxCard(props: ConnectorBoxCardProps) {
  const { id, checked, connectorPlugin, hoverable, active, borderWidth, borderStyle } = props;
  return (
    <BoxCard
      active={checked || active}
      borderStyle={borderStyle}
      borderWidth={borderWidth}
      hoverable={hoverable}
      id={id}
    >
      <ConnectorRadioCardContent connectorPlugin={connectorPlugin} />
    </BoxCard>
  );
}

export type ConnectorPlugin = { class: string; type: 'sink' | 'source'; version?: string };

function ConnectorRadioCardContent({ connectorPlugin }: { connectorPlugin: ConnectorPlugin }) {
  const { friendlyName, logo, description, learnMoreLink } = findConnectorMetadata(connectorPlugin.class) ?? {};
  const displayName = friendlyName ?? removeNamespace(connectorPlugin.class);
  const type = connectorPlugin.type ?? 'unknown';

  return (
    <Flex direction="column">
      <Box height="32px" mb="2" width="32px">
        {logo}
      </Box>

      <Box fontSize=".85em" fontWeight="600">
        {type === 'source' ? 'Import from' : 'Export to'}
      </Box>

      <Box fontSize="1.1em" fontWeight="600" mb="2">
        {displayName}
      </Box>

      <Text color="gray.500" fontSize=".85em" noOfLines={3}>
        {description}
      </Text>
      {learnMoreLink && (
        <Box mt="2">
          <Tag mt="auto">
            <Link href={learnMoreLink} isExternal opacity=".8">
              <TagLabel>Documentation</TagLabel>
            </Link>
          </Tag>
        </Box>
      )}
    </Flex>
  );
}

export function getConnectorFriendlyName(className?: string) {
  if (!className) return '';

  const { friendlyName } = findConnectorMetadata(className) ?? {};
  const displayName = friendlyName ?? removeNamespace(className);

  return displayName;
}
