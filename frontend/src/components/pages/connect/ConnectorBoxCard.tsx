import {findConnectorMetadata, removeNamespace} from './helper';
import styles from './ConnectorBoxCard.module.scss';
import React from 'react';
import BoxCard, {BoxCardProps} from '../../misc/BoxCard';
import {HiddenRadioOption} from '../../misc/HiddenRadioList';

interface ConnectorBoxCardProps extends Omit<BoxCardProps, "children">, Omit<HiddenRadioOption<string>, "render" | "value"> {
  connectorPlugin: ConnectorPlugin;
}

export function ConnectorBoxCard(props: ConnectorBoxCardProps) {
  const {checked, connectorPlugin, hoverable, active, borderWidth, borderStyle} = props;
  return (<BoxCard active={checked || active} hoverable={hoverable} borderStyle={borderStyle} borderWidth={borderWidth}>
    <ConnectorRadioCardContent connectorPlugin={connectorPlugin}/>
  </BoxCard>);
}

export type ConnectorPlugin = { class: string; type?: string; version?: string };

function ConnectorRadioCardContent({connectorPlugin}: { connectorPlugin: ConnectorPlugin }) {
  const {friendlyName, logo, author = 'unknown'} = findConnectorMetadata(connectorPlugin.class) ?? {};
  const displayName = friendlyName ?? removeNamespace(connectorPlugin.class);
  const type = connectorPlugin.type ?? 'unknown'
  const version = connectorPlugin.version ?? 'unknown'

  return <div className={styles.radioCardContent}>
    <span className={styles.radioCardLogo}>{logo}</span>
    <div className={styles.radioCardInfo}>
      <strong>{displayName} {connectorPlugin.type != null
          ? <span className={styles.pluginType}>({type})</span>
          : null}</strong>
      {connectorPlugin.version != null
          ? <p className={styles.pluginMeta}>
            Version: {version} | Author: {author}
          </p>
          : null}
    </div>
  </div>;
}
