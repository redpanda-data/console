import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Link as ChakraLink,
  CodeBlock,
  Grid,
  Heading,
  ListItem,
  OrderedList,
  Stack,
  Text,
} from '@redpanda-data/ui';

import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';

const rpkInitTransform = 'rpk transform init --language=tinygo';

export class TransformsSetup extends PageComponent<Record<string, never>> {
  initPage(p: PageInitHelper) {
    p.title = 'Transforms Setup';
    p.addBreadcrumb('Transforms', '/transforms');
    p.addBreadcrumb('Transforms Setup', '/transforms-setup');
  }

  render() {
    return (
      <Grid gap={10} templateColumns="1fr 320px">
        <Stack spacing={3}>
          <Heading as="h2">Data transforms</Heading>
          <Text>
            Data transforms let you run common data streaming tasks, like filtering, scrubbing, and transcoding, within
            Redpanda.{' '}
            <ChakraLink
              href="https://docs.redpanda.com/current/develop/data-transforms/build"
              isExternal
              style={{ textDecoration: 'underline solid 1px' }}
            >
              Learn more
            </ChakraLink>
          </Text>

          <Heading as="h3">Getting started</Heading>

          <Tabs
            tabs={[
              { key: 'go', title: 'Go', content: <TabGo /> },
              { key: 'rust', title: 'Rust', content: <TabRust />, disabled: true },
            ]}
          />
        </Stack>
      </Grid>
    );
  }
}

const exampleDir = `${`
.
|-- go.mod
|-- go.sum
|-- README.md
|-- transform.go
|-- transform.yaml
`.trim()}\n`;

function TabGo(_p: Record<string, never>) {
  return (
    <OrderedList display="flex" flexDirection="column" gap="0.5rem">
      <ListItem>
        <Text mt={3}>Create and initialize a data transforms project:</Text>
        <CodeBlock codeString={rpkInitTransform} language="bash" />

        <Text mt={3}>
          If you do not include the <code>--language</code> flag, the <code>transform init</code> command will prompt
          you for the language.
        </Text>

        <Text mt={3}>A successful command generates project files in your current directory:</Text>
        <CodeBlock codeString={exampleDir} language="text" />

        <Text mt={3}>
          The <code>transform.go</code> file contains the transform logic, and the <code>transform.yaml</code> file
          specifies the transform's configuration.
        </Text>

        <Alert status="info">
          <AlertIcon />
          <Box>
            <AlertTitle>Hint</AlertTitle>
            <AlertDescription>
              When creating a custom data transform, initialization steps can be done either in <code>main</code>{' '}
              (because it's only run once at the start of the package) or in Go's standard predefined{' '}
              <code>init()</code> function. Although state can be cached in global variables, Redpanda may restart a
              WASM module at any point, which causes the state to be lost.
            </AlertDescription>
          </Box>
        </Alert>
      </ListItem>
    </OrderedList>
  );
}

function TabRust(_p: Record<string, never>) {
  return 'rust content';
}
