import {findConnectorMetadata, removeNamespace} from './helper';
import styles from './ConnectorBoxCard.module.scss';
import React from 'react';
import BoxCard, {BoxCardProps} from '../../misc/BoxCard';
import {HiddenRadioOption} from '../../misc/HiddenRadioList';

interface ConnectorBoxCardProps extends BoxCardProps, HiddenRadioOption<string> {
  connectorPlugin: ConnectorPlugin;
}

export function ConnectorBoxCard(props: ConnectorBoxCardProps) {
  const {checked, connectorPlugin} = props;
  return (<BoxCard active={checked}>
    <ConnectorRadioCardContent connectorPlugin={connectorPlugin}/>
  </BoxCard>);
}

type ConnectorPlugin = { class: string; type?: string; version?: string };

function ConnectorRadioCardContent({connectorPlugin}: { connectorPlugin: ConnectorPlugin }) {
  const {friendlyName, logo} = findConnectorMetadata(connectorPlugin.class) ?? {};
  const displayName = friendlyName ?? removeNamespace(connectorPlugin.class);
  return <div className={styles.radioCardContent}>
    <span className={styles.radioCardLogo}>{logo}</span>
    <div className={styles.radioCardInfo}>
      <strong>{displayName} {connectorPlugin.type != null
          ? <span className={styles.pluginType}>({connectorPlugin.type})</span>
          : null}</strong>
      {connectorPlugin.version != null
          ? <p className={styles.pluginMeta}>
            Version: {connectorPlugin.version}
          </p>
          : null}
    </div>
  </div>;
}
