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

import { Component } from 'react';

import type { Topic } from '../../../state/rest-interfaces';
import '../../../utils/array-extensions';
import { Button, Empty, VStack } from '@redpanda-data/ui';
import { motion } from 'framer-motion';
import { observer } from 'mobx-react';
import ReactMarkdown, { defaultUrlTransform as baseUriTransformer } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';

import { api } from '../../../state/backend-api';
import { animProps } from '../../../utils/animation-props';
import { DefaultSkeleton } from '../../../utils/tsx-utils';

// Regex for extracting language from code blocks
const CODE_LANGUAGE_REGEX = /language-(\w+)/;

// Regex for removing trailing newlines
const TRAILING_NEWLINE_REGEX = /\n$/;

// Test for link sanitizer
/*
<a href="javascript:alert('h4x0red!');">
My nonsuspious link
</a>
*/

const allowedProtocols = ['http://', 'https://', 'mailto://'];

function sanitizeUrl(uri: string): string {
  const baseTransformed = baseUriTransformer(uri);
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.log('baseTransformed', baseTransformed);
  if (baseTransformed !== uri) {
    return baseTransformed;
  }

  const cleanedUri = uri.trim().toLocaleLowerCase();

  for (const p of allowedProtocols) {
    if (cleanedUri.startsWith(p)) {
      return uri;
    }
  }

  return ''; // didn't match any allowed protocol, remove the link
}

@observer
export class TopicDocumentation extends Component<{ topic: Topic }> {
  private readonly components = {
    // biome-ignore lint/suspicious/noExplicitAny: react-markdown component props are complex and dynamic
    code({ inline, className, children, ...props }: any) {
      const match = CODE_LANGUAGE_REGEX.exec(className || '');
      return !inline && match ? (
        <SyntaxHighlighter
          customStyle={{
            backgroundColor: null,
            border: null,
            margin: null,
            padding: null,
          }}
          language={match[1]}
          PreTag="div"
          style={vs}
          {...props}
        >
          {String(children).replace(TRAILING_NEWLINE_REGEX, '')}
        </SyntaxHighlighter>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  render() {
    const docu = api.topicDocumentation.get(this.props.topic.topicName);
    if (docu === undefined) {
      return DefaultSkeleton; // not yet loaded
    }
    if (!docu.isEnabled) {
      return errorNotConfigured;
    }

    const markdown = docu?.text;
    if (markdown === null || markdown === undefined) {
      return errorNotFound;
    }

    if (markdown === '') {
      return errorEmpty;
    }

    return (
      <div className="topicDocumentation">
        <ReactMarkdown
          components={this.components}
          remarkPlugins={[remarkGfm, remarkEmoji]}
          skipHtml={false}
          urlTransform={sanitizeUrl}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    );
  }
}

const errorNotConfigured = renderDocuError(
  'Not Configured',
  <>
    <p>Topic Documentation is not configured in Redpanda Console.</p>
    <p>
      Provide the connection credentials in the Redpanda Console config, to fetch and display docmentation for the
      topics.
    </p>
  </>
);
const errorNotFound = renderDocuError(
  'Not Found',
  <>
    <p>No documentation file was found for this topic.</p>
    <ul style={{ listStyle: 'none' }}>
      <li>
        Ensure the Git connection to the documentation repository is configured correctly in the Redpanda Console
        backend.
      </li>
      <li>Ensure that a markdown file (named just like the topic) exists in the repository.</li>
    </ul>
  </>
);
const errorEmpty = renderDocuError(
  'Empty',
  <>
    <p>The documentation file is empty.</p>
    <p>
      In case you just changed the file, keep in mind that Redpanda Console will only
      <br />
      periodically check the documentation repo for changes (every minute by default).
    </p>
  </>
);

// todo: use common renderError function everywhere
// todo: use <MotionAlways> for them
function renderDocuError(title: string, body: JSX.Element) {
  return (
    <motion.div {...animProps} key={'b'} style={{ margin: '2rem 1rem' }}>
      <VStack gap={4}>
        <Empty description={title} />
        {body}
        <a href="https://docs.redpanda.com/docs/manage/console/" rel="noopener noreferrer" target="_blank">
          <Button variant="solid">Redpanda Console Documentation</Button>
        </a>
      </VStack>
    </motion.div>
  );
}
