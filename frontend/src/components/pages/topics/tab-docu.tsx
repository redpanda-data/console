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

import type { FC } from 'react';

import type { Topic } from '../../../state/rest-interfaces';
import '../../../utils/array-extensions';
import { Button, Empty, VStack } from '@redpanda-data/ui';
import { motion } from 'framer-motion';
import ReactMarkdown, { defaultUrlTransform as baseUriTransformer } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';

import { useTopicDocumentationQuery } from '../../../react-query/api/topic';
import { animProps } from '../../../utils/animation-props';
import { DefaultSkeleton } from '../../../utils/tsx-utils';

// Regex for extracting language from code blocks
const CODE_LANGUAGE_REGEX = /language-(\w+)/;

// Regex for removing trailing newlines
const TRAILING_NEWLINE_REGEX = /\n$/;

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

// biome-ignore lint/suspicious/noExplicitAny: react-markdown component props are complex and dynamic
const CodeBlock = ({ inline, className, children, ...props }: any) => {
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
};

const markdownComponents = { code: CodeBlock };

export const TopicDocumentation: FC<{ topic: Topic }> = ({ topic }) => {
  const { data: docu, isLoading } = useTopicDocumentationQuery(topic.topicName);

  if (isLoading) {
    return DefaultSkeleton;
  }
  if (!docu) {
    return DefaultSkeleton;
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
        components={markdownComponents}
        remarkPlugins={[remarkGfm, remarkEmoji]}
        skipHtml={false}
        urlTransform={sanitizeUrl}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
};

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
