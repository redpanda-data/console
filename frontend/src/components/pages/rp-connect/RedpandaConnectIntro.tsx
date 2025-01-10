import { Link as ChakraLink } from '@redpanda-data/ui';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  CodeBlock,
  Flex,
  Grid,
  Heading,
  Image,
  ListItem,
  OrderedList,
  Stack,
  Text,
} from '@redpanda-data/ui';
import { useState } from 'react';
import { Link as ReactRouterLink } from 'react-router-dom';
import RedpandaConnectLogo from '../../../assets/redpanda/rp-connect.svg';
import PipelinesYamlEditor from '../../misc/PipelinesYamlEditor';
import { SingleSelect } from '../../misc/Select';

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

export function RedpandaConnectIntro(_p: {}) {
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
    <Grid templateColumns="1fr 320px" gap={10}>
      <Stack spacing={3}>
        <Heading as="h2">Using Redpanda Connect</Heading>
        <Text>
          Redpanda Connect is a declarative data streaming service with wide range of{' '}
          <ChakraLink
            isExternal
            href="https://docs.redpanda.com/redpanda-connect/about#components"
            style={{ textDecoration: 'underline solid 1px' }}
          >
            connectors and processors
          </ChakraLink>
          .
        </Text>

        <OrderedList display="flex" flexDirection="column" gap="0.5rem">
          <ListItem>
            <Text mt={3}>Install Redpanda Connect</Text>
            <Box>
              <Stack gap={2} mb={6}>
                <Text fontWeight="bold">Choose your install method</Text>
                <Box width="275px">
                  <SingleSelect<typeof selectedInstall>
                    options={options}
                    value={selectedInstall}
                    onChange={setSelectedInstall}
                  />
                </Box>
                <Box>
                  <CodeBlock language="bash" codeString={installInstructions[selectedInstall]} />
                </Box>
              </Stack>
            </Box>
          </ListItem>

          <ListItem>
            <Text mt={3}>
              Build your first pipeline. Start from the Redpanda data generator example below. Explore the components
              using autocomplete (CTRL/CMD+Space). For other examples and use cases, see{' '}
              <ChakraLink
                isExternal
                href="https://docs.redpanda.com/redpanda-connect/cookbooks/custom_metrics"
                style={{ textDecoration: 'underline solid 1px' }}
              >
                our documentation
              </ChakraLink>
              .
            </Text>
            <Flex ml="-1rem" mt={3} minHeight="550px" minWidth="500px">
              <PipelinesYamlEditor
                defaultPath="config.yaml"
                path="config.yaml"
                value={editorText}
                onChange={(e) => {
                  if (e) setEditorText(e);
                }}
                language="yaml"
              />
            </Flex>
          </ListItem>

          <ListItem>
            <Text mt={3}>
              Set up your connection to Redpanda for data in the{' '}
              <ChakraLink
                isExternal
                href="https://docs.redpanda.com/redpanda-connect/components/outputs/kafka_franz"
                style={{ textDecoration: 'underline solid 1px' }}
              >
                kafka_franz
              </ChakraLink>{' '}
              component and{' '}
              <ChakraLink
                isExternal
                href="https://docs.redpanda.com/redpanda-connect/components/redpanda/about"
                style={{ textDecoration: 'underline solid 1px' }}
              >
                logs
              </ChakraLink>{' '}
              in the redpanda component.
            </Text>
          </ListItem>

          <ListItem>
            <Text mt={3}>Make sure that your output topic and logs topic both exist.</Text>
          </ListItem>

          <ListItem>
            <Text mt={3}>
              To test the above config in the Terminal, first save your configuration from the editor to your working
              directory as <code>config.yaml</code>.
            </Text>
          </ListItem>

          <ListItem>
            <Text mt={3}>Test the config by executing it:</Text>
            <Box maxWidth="400px" marginBlock={3}>
              <CodeBlock language="sh" codeString="rpk connect run ./config.yaml" />
              <Text mt={3}>Anything you write to stdin will be written unchanged to stdout.</Text>
            </Box>
          </ListItem>

          <ListItem>
            <Text mt={3}>
              Go to the{' '}
              <ChakraLink as={ReactRouterLink} to="/topics" style={{ textDecoration: 'underline solid 1px' }}>
                Topics
              </ChakraLink>{' '}
              page to read the logs and your output topic.{' '}
            </Text>
          </ListItem>
        </OrderedList>
      </Stack>

      <Stack spacing={8} mt={12}>
        <Image src={RedpandaConnectLogo} alt="redpanda bot icon" />

        <Alert status="info">
          <AlertIcon />
          <Box>
            <AlertTitle>Hint</AlertTitle>
            <AlertDescription>
              In the Terminal, to show the full menu of components available, use <code>rpk connect list</code>.
              <br />
              <br />
              Then, to generate a config with a specific listed component, use
              <br />
              <code>rpk connect create [component]</code>.
              <br />
              <br />
              For more help: <code>rpk connect create -h</code>
            </AlertDescription>
          </Box>
        </Alert>
      </Stack>
    </Grid>
  );
}
