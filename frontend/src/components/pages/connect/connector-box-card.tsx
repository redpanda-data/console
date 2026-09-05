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

import { Badge } from 'components/redpanda-ui/components/badge';
import { Link } from 'components/redpanda-ui/components/typography';

import { findConnectorMetadata, removeNamespace } from './helper';
import BoxCard, { type BoxCardProps } from '../../misc/box-card';
import type { HiddenRadioOption } from '../../misc/hidden-radio-list';

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
    <div className="flex flex-col">
      <div className="mb-2 size-8">{logo}</div>

      <div className="text-label">{type === 'source' ? 'Import from' : 'Export to'}</div>

      <div className="mb-2 font-semibold text-body-lg">{displayName}</div>

      <p className="line-clamp-3 text-body-sm text-subtle">{description}</p>
      {learnMoreLink ? (
        <div className="mt-2">
          <Badge tone="default" variant="subtle">
            <Link className="opacity-80" href={learnMoreLink} rel="noopener noreferrer" target="_blank">
              Documentation
            </Link>
          </Badge>
        </div>
      ) : null}
    </div>
  );
}

export function getConnectorFriendlyName(className?: string) {
  if (!className) {
    return '';
  }

  const { friendlyName } = findConnectorMetadata(className) ?? {};
  const displayName = friendlyName ?? removeNamespace(className);

  return displayName;
}
