import { Link } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { DynamicCodeBlock } from 'components/redpanda-ui/components/code-block-dynamic';
import { Heading, List, ListItem, Text, Link as UILink } from 'components/redpanda-ui/components/typography';
import { useState } from 'react';
import { docsLinks } from 'utils/docs-links';

import RedpandaConnectLogo from '../../../assets/redpanda/rp-connect.svg';
import PipelinesYamlEditor from '../../misc/pipelines-yaml-editor';
import { SingleSelect } from '../../misc/select';

const installInstructions = {
  Linux: `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-linux-amd64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH="~/.local/bin:$PATH" &&
  unzip rpk-linux-amd64.zip -d ~/.local/bin/`,
  'macOS - Homebrew': 'brew install redpanda-data/tap/redpanda',
  'macOS - Apple Silicon download': `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-darwin-arm64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH=$PATH:~/.local/bin &&
  unzip rpk-darwin-arm64.zip -d ~/.local/bin/`,
  'macOS - Intel download': `curl -LO https://github.com/redpanda-data/redpanda/releases/latest/download/rpk-darwin-amd64.zip &&
  mkdir -p ~/.local/bin &&
  export PATH=$PATH:~/.local/bin &&
  unzip rpk-darwin-amd64.zip -d ~/.local/bin/`,
} as const;

export function RedpandaConnectIntro(_p: Record<string, never>) {
  const exampleCode = `
input:
  generate:
    interval: 1s
    mapping: |
      root.id = uuid_v4()
      root.user.name = fake("name")
      root.user.email = fake("email")
      root.content = fake("paragraph")

pipeline:
  processors:
    - mutation: |
        root.hash = content().hash("sha256").encode("hex")

output:
  kafka_franz:
    seed_brokers:
        - TODO_REDPANDA_BROKER_ADDRESS
    topic: TODO_YOUR_OUTPUT_TOPIC

redpanda:
  seed_brokers:
    - TODO_REDPANDA_BROKER_ADDRESS
  logs_topic: __redpanda.connect.logs
  logs_level: info
`.trim();
  const [editorText, setEditorText] = useState(exampleCode);
  const [selectedInstall, setSelectedInstall] = useState('macOS - Homebrew' as keyof typeof installInstructions);
  const options = Object.keys(installInstructions).map((x) => ({ value: x as typeof selectedInstall }));

  return (
    <div className="grid grid-cols-[1fr_320px] gap-10">
      <div className="flex flex-col gap-3">
        <Heading as="h2">Using Redpanda Connect</Heading>
        <Text>
          Redpanda Connect is a declarative data streaming service with wide range of{' '}
          <UILink href={docsLinks.connect.componentCatalog} rel="noopener noreferrer" target="_blank">
            connectors and processors
          </UILink>
          .
        </Text>

        <List className="flex flex-col gap-2" ordered>
          <ListItem>
            <Text className="mt-3">Install Redpanda Connect</Text>
            <div>
              <div className="mb-6 flex flex-col gap-2">
                <Text className="font-bold">Choose your install method</Text>
                <div className="w-[275px]">
                  <SingleSelect<typeof selectedInstall>
                    onChange={setSelectedInstall}
                    options={options}
                    value={selectedInstall}
                  />
                </div>
                <div>
                  <DynamicCodeBlock code={installInstructions[selectedInstall]} lang="bash" />
                </div>
              </div>
            </div>
          </ListItem>

          <ListItem>
            <Text className="mt-3">
              Build your first pipeline. Start from the Redpanda data generator example below. Explore the components
              using autocomplete (CTRL/CMD+Space). For other examples and use cases, see{' '}
              <UILink href={docsLinks.connect.cookbookCustomMetrics} rel="noopener noreferrer" target="_blank">
                our documentation
              </UILink>
              .
            </Text>
            <div className="mt-3 -ml-4 flex min-h-[550px] min-w-[500px]">
              <PipelinesYamlEditor
                defaultPath="config.yaml"
                language="yaml"
                onChange={(e) => {
                  if (e) {
                    setEditorText(e);
                  }
                }}
                path="config.yaml"
                value={editorText}
              />
            </div>
          </ListItem>

          <ListItem>
            <Text className="mt-3">
              Set up your connection to Redpanda for data in the{' '}
              <UILink href={docsLinks.connect.outputKafkaFranz} rel="noopener noreferrer" target="_blank">
                kafka_franz
              </UILink>{' '}
              component and{' '}
              <UILink href={docsLinks.connect.redpandaComponent} rel="noopener noreferrer" target="_blank">
                logs
              </UILink>{' '}
              in the redpanda component.
            </Text>
          </ListItem>

          <ListItem>
            <Text className="mt-3">Make sure that your output topic and logs topic both exist.</Text>
          </ListItem>

          <ListItem>
            <Text className="mt-3">
              To test the above config in the Terminal, first save your configuration from the editor to your working
              directory as <code>config.yaml</code>.
            </Text>
          </ListItem>

          <ListItem>
            <Text className="mt-3">Test the config by executing it:</Text>
            <div className="my-3 max-w-[400px]">
              <DynamicCodeBlock code="rpk connect run ./config.yaml" lang="sh" />
              <Text className="mt-3">Anything you write to stdin will be written unchanged to stdout.</Text>
            </div>
          </ListItem>

          <ListItem>
            <Text className="mt-3">
              Go to the{' '}
              <UILink as={Link} to="/topics">
                Topics
              </UILink>{' '}
              page to read the logs and your output topic.{' '}
            </Text>
          </ListItem>
        </List>
      </div>

      <div className="mt-12 flex flex-col gap-8">
        <img alt="redpanda bot icon" src={RedpandaConnectLogo} />

        {/* The Registry Alert renders its own icon; AlertDescription is a grid. */}
        <Alert variant="informative">
          <AlertTitle>Hint</AlertTitle>
          <AlertDescription>
            <div>
              In the Terminal, to show the full menu of components available, use <code>rpk connect list</code>.
            </div>
            <div>
              Then, to generate a config with a specific listed component, use{' '}
              <code>rpk connect create [component]</code>.
            </div>
            <div>
              For more help: <code>rpk connect create -h</code>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}
