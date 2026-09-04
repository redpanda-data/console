import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { CodeBlock, Pre } from 'components/redpanda-ui/components/code-block';
import { InlineCode, Link, List, ListItem } from 'components/redpanda-ui/components/typography';
import { docsLinks } from 'utils/docs-links';

import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';

const rpkInitTransform = 'rpk transform init --language=tinygo';

export class TransformsSetup extends PageComponent {
  initPage(p: PageInitHelper) {
    p.title = 'Transforms Setup';
    p.addBreadcrumb('Transforms', '/transforms');
    p.addBreadcrumb('Transforms Setup', '/transforms-setup');
  }

  render() {
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <h2 className="text-heading-lg">Data transforms</h2>
          <p className="text-body">
            Data transforms let you run common data streaming tasks, like filtering, scrubbing, and transcoding, within
            Redpanda.{' '}
            <Link href={docsLinks.selfManaged.dataTransformsBuild} rel="noopener noreferrer" target="_blank">
              Learn more
            </Link>
          </p>

          <h3 className="text-heading-md">Getting started</h3>

          <Tabs
            tabs={[
              { key: 'go', title: 'Go', content: <TabGo /> },
              { key: 'rust', title: 'Rust', content: <TabRust />, disabled: true },
            ]}
          />
        </div>
      </div>
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
    <List className="flex flex-col gap-2" ordered>
      <ListItem>
        <p className="mt-3 text-body">Create and initialize a data transforms project:</p>
        <CodeBlock width="full">
          <Pre>{rpkInitTransform}</Pre>
        </CodeBlock>

        <p className="mt-3 text-body">
          If you do not include the <InlineCode>--language</InlineCode> flag, the{' '}
          <InlineCode>transform init</InlineCode> command will prompt you for the language.
        </p>

        <p className="mt-3 text-body">A successful command generates project files in your current directory:</p>
        <CodeBlock width="full">
          <Pre>{exampleDir}</Pre>
        </CodeBlock>

        <p className="mt-3 text-body">
          The <InlineCode>transform.go</InlineCode> file contains the transform logic, and the{' '}
          <InlineCode>transform.yaml</InlineCode> file specifies the transform's configuration.
        </p>

        <Alert variant="informative">
          <AlertTitle>Hint</AlertTitle>
          <AlertDescription>
            When creating a custom data transform, initialization steps can be done either in{' '}
            <InlineCode>main</InlineCode> (because it's only run once at the start of the package) or in Go's standard
            predefined <InlineCode>init()</InlineCode> function. Although state can be cached in global variables,
            Redpanda may restart a WASM module at any point, which causes the state to be lost.
          </AlertDescription>
        </Alert>
      </ListItem>
    </List>
  );
}

function TabRust(_p: Record<string, never>) {
  return 'rust content';
}
