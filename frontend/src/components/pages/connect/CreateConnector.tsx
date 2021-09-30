import React, {useState} from 'react';
import {PageComponent, PageInitHelper} from '../Page';
import {animProps} from '../../../utils/animationProps';
import {motion} from 'framer-motion';
import {ApiOutlined, DatabaseOutlined, SearchOutlined, SettingOutlined} from '@ant-design/icons';
import {Wizard, WizardStep} from '../../misc/Wizard';
import Card from '../../misc/Card';

import styles from './CreateConnector.module.scss';
import {observer} from 'mobx-react';
import {api} from '../../../state/backendApi';
import {appGlobal} from '../../../state/appGlobal';
import {ClusterConnectors} from '../../../state/restInterfaces';
import {Select} from 'antd';
import {HiddenRadioList} from '../../misc/HiddenRadioList';
import {ConnectorBoxCard, ConnectorPlugin} from './ConnectorBoxCard';
import {DemoPage} from './dynamic-ui/components';
import KowlEditor from '../../misc/KowlEditor';

const {Option} = Select;

interface ConnectorTypeProps {
  connectClusters: Array<ClusterConnectors>;
  activeCluster: string | null;
  onActiveClusterChange: (clusterName: string | null) => void;
  selectedPlugin: ConnectorPlugin | null;
  onPluginSelectionChange: (plugin: ConnectorPlugin | null) => void;
}

const ConnectorType = observer(({
                                  connectClusters,
                                  activeCluster,
                                  onActiveClusterChange,
                                  selectedPlugin,
                                  onPluginSelectionChange,
                                }: ConnectorTypeProps) => {
  return (<>
    <h2>Installation Target</h2>
    <Select<string>
        placeholder="Choose Connect Cluster…"
        onChange={(clusterName) => {
          api.refreshClusterAdditionalInfo(clusterName, true);
          onActiveClusterChange(clusterName);
        }}
        defaultValue={activeCluster || undefined}
    >
      {connectClusters.map(cluster => <Option value={cluster.clusterName}>{cluster.clusterName}</Option>)}
    </Select>
    {activeCluster == null ? null : (<>
      <h2>Connector Type</h2>

      <HiddenRadioList<ConnectorPlugin>
          name={'connector-type'}
          onChange={onPluginSelectionChange}
          value={selectedPlugin ?? undefined}
          options={api.connectAdditionalClusterInfo.get(activeCluster)?.plugins.map(plugin => ({
            value: plugin,
            render: (card) => <ConnectorBoxCard {...card} connectorPlugin={plugin}/>,
          })) || []}/>
    </>)}
  </>);
});

@observer
class CreateConnector extends PageComponent {
  initPage(p: PageInitHelper) {
    p.title = 'Create Connector';
    p.addBreadcrumb('Create Connector', '/create-connector');

    this.refreshData(false);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshConnectClusters(force);
  }

  render() {
    const clusters = api.connectConnectors?.clusters;
    if (clusters == null) return null;

    return (
        <motion.div {...animProps} className={styles.motionContainer}>
          <Card className={styles.wizardView}>
            <ConnectorWizard connectClusters={clusters}/>
          </Card>
        </motion.div>
    );
  }
}

interface ConnectorWizardProps {
  connectClusters: Array<ClusterConnectors>;
}

function ConnectorWizard({connectClusters}: ConnectorWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<ConnectorPlugin | null>(null);
  const [properties, setProperties] = useState('');

  const steps: Array<WizardStep> = [
    {
      title: 'Connector Type',
      description: 'Choose type of connector.',
      icon: <DatabaseOutlined/>,
      content: <ConnectorType
          connectClusters={connectClusters}
          activeCluster={activeCluster}
          onActiveClusterChange={setActiveCluster}
          selectedPlugin={selectedPlugin}
          onPluginSelectionChange={setSelectedPlugin}
      />,
      postConditionMet: () => activeCluster != null && selectedPlugin != null,
    }, {
      title: 'Properties',
      description: 'Configure basic connection properties.',
      icon: <ApiOutlined/>,
      content: <>
        {selectedPlugin != null
            ? <div className={styles.connectorBoxCard}>
              <ConnectorBoxCard
                  connectorPlugin={selectedPlugin}
                  borderStyle={'dashed'}
                  borderWidth={'medium'}
                  hoverable={false}/>
            </div>
            : null}
        <DemoPage onChange={setProperties}/>
      </>,
      postConditionMet: () => true,
    }, {
      title: 'Additional Properties',
      description: 'Add advanced connector configs, SMTs, etc.',
      icon: <SettingOutlined/>,
      content: 'More config options...',
      postConditionMet: () => true,
    }, {
      title: 'Review',
      description: 'Review and optionally patch the created connector config.',
      icon: <SearchOutlined/>,
      content: <Review
          connectorPlugin={selectedPlugin}
          properties={properties}
          onChange={editorContent => setProperties(String(editorContent))}/>,
      postConditionMet: () => true,
    }];

  return <Wizard state={{
    canContinue: () => steps[currentStep].postConditionMet(),
    next: () => currentStep < steps.length - 1 ? setCurrentStep(n => n + 1) : undefined,
    previous: () => currentStep > 0 ? setCurrentStep(n => n - 1) : undefined,
    isLast: () => currentStep === steps.length - 1,
    isFirst: () => currentStep === 0,
    getCurrentStep: () => [currentStep, steps[currentStep]],
    getSteps: () => steps,
  }}/>;
}

interface ReviewProps {
  connectorPlugin: ConnectorPlugin | null;
  properties?: string;
  onChange: (editorContent: string | undefined) => void;
}

function Review({connectorPlugin, properties, onChange}: ReviewProps) {
  return <>
    {connectorPlugin != null
        ? <>
          <h2>Connector Plugin</h2>
          <ConnectorBoxCard
              connectorPlugin={connectorPlugin}
              borderStyle="dashed"
              borderWidth="medium"
              hoverable={false}/>
        </>
        : null
    }
    <h2>Connector Properties</h2>
    <div style={{margin: "0 auto 1.5rem"}}>
      <KowlEditor
          language="json"
          value={properties}
          onChange={onChange}
          height="600px"
      />
    </div>
  </>;
}

export default CreateConnector;
