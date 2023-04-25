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

import { findConnectorMetadata, removeNamespace } from './helper';
import BoxCard, { BoxCardProps } from '../../misc/BoxCard';
import { HiddenRadioOption } from '../../misc/HiddenRadioList';
import { Box, Link, Text, Tag, TagLabel, Flex } from '@redpanda-data/ui';

interface ConnectorBoxCardProps extends Omit<BoxCardProps, 'children'>, Omit<HiddenRadioOption<string>, 'render' | 'value'> {
    connectorPlugin: ConnectorPlugin;
    id?: string;
}

export function ConnectorBoxCard(props: ConnectorBoxCardProps) {
    const { id, checked, connectorPlugin, hoverable, active, borderWidth, borderStyle } = props;
    return (<BoxCard active={checked || active} hoverable={hoverable} borderStyle={borderStyle} borderWidth={borderWidth} id={id}>
        <ConnectorRadioCardContent connectorPlugin={connectorPlugin} />
    </BoxCard>);
}

export type ConnectorPlugin = { class: string; type: 'sink' | 'source'; version?: string };

function ConnectorRadioCardContent({ connectorPlugin }: { connectorPlugin: ConnectorPlugin }) {
    const { friendlyName, logo, description, learnMoreLink } = findConnectorMetadata(connectorPlugin.class) ?? {};
    const displayName = friendlyName ?? removeNamespace(connectorPlugin.class);
    const type = connectorPlugin.type ?? 'unknown'

    return <Flex direction="column">
        <Box width="32px" height="32px" mb="2">{logo}</Box>

        <Box fontWeight="600" fontSize=".85em">{type == 'source' ? 'Import from' : 'Export to'}</Box>

        <Box fontWeight="600" fontSize="1.1em" mb="2">{displayName}</Box>

        <Text fontSize=".85em" color="gray.500" noOfLines={3}>
            {description}
        </Text>
        {learnMoreLink &&
            <Box mt="2">
                <Tag mt="auto">
                    <Link href={learnMoreLink} isExternal opacity=".8">
                        <TagLabel>Documentation</TagLabel>
                    </Link>
                </Tag>
            </Box>
        }
    </Flex>
}

export function getConnectorFriendlyName(className?: string) {
    if (!className)
        return '';

    const { friendlyName } = findConnectorMetadata(className) ?? {};
    const displayName = friendlyName ?? removeNamespace(className);

    return displayName;
}
