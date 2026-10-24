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

import { Label } from 'components/redpanda-ui/components/label';
import { RadioGroup, RadioGroupItem } from 'components/redpanda-ui/components/radio-group';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Switch } from 'components/redpanda-ui/components/switch';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { ConnectorStepComponent } from './connector-step';
import { isEmbedded } from '../../../../config';
import { api } from '../../../../state/backend-api';
import type { ConnectorPropertiesStore, PropertyGroup } from '../../../../state/connect/state';
import type { ConnectorStep } from '../../../../state/rest-interfaces';
import { clone } from '../../../../utils/json-utils';
import KowlEditor from '../../../misc/kowl-editor';

export type ConfigPageProps = {
  connectorStore: ConnectorPropertiesStore;
  context: 'CREATE' | 'EDIT';
};

// Re-renders the caller whenever the store reports a change.
function useConnectorStoreVersion(connectorStore: ConnectorPropertiesStore) {
  const subscribe = useCallback((cb: () => void) => connectorStore.subscribe(cb), [connectorStore]);
  useSyncExternalStore(subscribe, connectorStore.getVersion);
}

// Find all steps, each with its property groups
function connectorStepsWithGroups(
  connectorStore: ConnectorPropertiesStore
): { step: ConnectorStep; groups: PropertyGroup[] }[] {
  return connectorStore.connectorStepDefinitions.map((step) => ({
    step,
    groups: connectorStore.allGroups.filter((g) => g.step.stepIndex === step.stepIndex),
  }));
}

export const ConfigPage: React.FC<ConfigPageProps> = ({ connectorStore, context }: ConfigPageProps) => {
  useConnectorStoreVersion(connectorStore);

  const [viewMode, setViewMode] = useState<'form' | 'json'>(connectorStore.viewMode);
  if (connectorStore.error) {
    return (
      <div>
        <h3>Error</h3>
        <div className="codeBox">{connectorStore.error}</div>
      </div>
    );
  }

  if (connectorStore.initPending) {
    return (
      <div className="mt-5">
        <SkeletonText lines={20} width="full" />
      </div>
    );
  }

  if (connectorStore.allGroups.length === 0) {
    return <div>debug: no groups</div>;
  }

  return (
    <>
      <div className="mb-8">
        <RadioGroup
          name="settingsMode"
          onValueChange={(next) => {
            connectorStore.viewMode = next as 'form' | 'json';
            setViewMode(next as 'form' | 'json');
          }}
          orientation="horizontal"
          value={viewMode}
        >
          {(['form', 'json'] as const).map((mode) => (
            <div className="flex items-center gap-2" key={mode}>
              <RadioGroupItem id={`settings-mode-${mode}`} testId={`${mode}_field`} value={mode} />
              <Label className="cursor-pointer" htmlFor={`settings-mode-${mode}`}>
                {mode === 'form' ? 'Form' : 'JSON'}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {viewMode === 'form' ? (
        <ConnectorFormView connectorStore={connectorStore} context={context} />
      ) : (
        <div style={{ margin: '0 auto 1.5rem' }}>
          <ConnectorJsonEditor connectorStore={connectorStore} context={context} />
        </div>
      )}
    </>
  );
};

function ConnectorFormView({ connectorStore, context }: ConfigPageProps) {
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(connectorStore.showAdvancedOptions);
  const steps = connectorStepsWithGroups(connectorStore);

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={showAdvancedOptions}
          id="show-advanced-options"
          onCheckedChange={(checked) => {
            connectorStore.showAdvancedOptions = checked;
            setShowAdvancedOptions(checked);
          }}
        />
        <Label className="cursor-pointer" htmlFor="show-advanced-options">
          Show advanced options
        </Label>
      </div>

      {steps.map(({ step, groups }) => (
        <ConnectorStepComponent
          allGroups={connectorStore.allGroups}
          connectorType={connectorStore.connectorType}
          context={context}
          groups={groups}
          key={step.stepIndex}
          showAdvancedOptions={showAdvancedOptions}
          step={step}
        />
      ))}
    </>
  );
}

function findExistingConnector(connectorStore: ConnectorPropertiesStore, connectorName: string) {
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.log('trying to obtain initial config from existing connector...', { name: connectorName });
  const cluster = api.connectConnectors?.clusters?.first((c) => c.clusterName === connectorStore.clusterName);
  const connector = cluster?.connectors.first((x) => x.name === connectorName);
  if (connector) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log('success! found connector config', {
      clusterName: connectorStore.clusterName,
      connectorName,
      config: clone(connector.config),
    });
    return connector;
  }

  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.log('unable to find existing connector for known connector name!', {
    clusterName: connectorStore.clusterName,
    connectorName,
  });
}

// Initialize connector with existing data
function initialConnectorJson(connectorStore: ConnectorPropertiesStore): string {
  const configObj = connectorStore.getConfigObject();
  const connectorName = (configObj as { name?: string })?.name;

  const existingConnector = connectorName ? findExistingConnector(connectorStore, connectorName) : undefined;
  if (existingConnector) {
    return JSON.stringify(existingConnector.config, undefined, 4);
  }

  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.log('creating "new" config for connector', {
    name: connectorName,
    config: clone(configObj),
  });

  return JSON.stringify(configObj, undefined, 4);
}

function ConnectorJsonEditor(p: { connectorStore: ConnectorPropertiesStore; context: 'CREATE' | 'EDIT' }) {
  const connectorStore = p.connectorStore;

  const [jsonText, setJsonText] = useState(() => initialConnectorJson(connectorStore));

  return (
    <KowlEditor
      height="600px"
      language="json"
      onChange={(x) => {
        if (!x) {
          return;
        }
        setJsonText(x);
        connectorStore.jsonText = x;
      }}
      options={{
        readOnly: isEmbedded() && p.context === 'EDIT',
      }}
      value={jsonText}
    />
  );
}
