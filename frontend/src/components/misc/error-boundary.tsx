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

import { Box, Button, Flex, Icon, useToast } from '@redpanda-data/ui';
import { CloseIcon, CopyAllIcon } from 'components/icons';
import React, { type CSSProperties, type FC } from 'react';
import StackTrace from 'stacktrace-js';

import { NoClipboardPopover } from './no-clipboard-popover';
import { envVarDebugAr } from '../../utils/env';
import { isClipboardAvailable } from '../../utils/feature-detection';
import { toJson } from '../../utils/json-utils';
import { navigatorClipboardErrorHandler, ObjToKv } from '../../utils/tsx-utils';

// background       rgb(35, 35, 35)
// div              rgba(206, 17, 38, 0.1)
// title            rgb(232, 59, 70)
// foreground
//    - main        rgb(252, 207, 207)
//    - highligh    rgb(204, 102, 102)
//    - secondary   rgb(135, 142, 145)

const valueStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  lineBreak: 'anywhere',

  fontSize: '12px',
  background: 'rgba(20,20,20,0.05)',
  borderRadius: '2px',
  padding: '1rem',
};

type InfoItem = {
  name: string;
  value: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
  errorInfo: object | null;
  decodingDone: boolean;
  infoItems: InfoItem[];
};

export class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, ErrorBoundaryState> {
  constructor(p: { children?: React.ReactNode }) {
    super(p);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      decodingDone: false,
      infoItems: [],
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 19 - extensive error parsing for multiple info types (stack, components, environment)
  componentDidCatch(error: Error | null, errorInfo: object) {
    const infoItems: InfoItem[] = [];

    // Type
    if (error?.name && error.name.toLowerCase() !== 'error') {
      infoItems.push({ name: 'Type', value: error.name });
    }

    // Message
    if (error?.message) {
      infoItems.push({ name: 'Message', value: error.message });
    } else {
      infoItems.push({ name: 'Message', value: '(no message)' });
    }

    // Call Stack - placeholder for decoded stack
    const decodedStackIndex = infoItems.length;
    infoItems.push({
      name: 'Stack (Decoded)',
      value: 'Decoding stack trace, please wait...',
    });

    // Normal stack trace
    if (error?.stack) {
      let s = error.stack;
      // remove "Error: " prefix
      s = s.removePrefix('error:').trim();
      // remove the error message as well, leaving only the stack trace
      if (error.message && s.startsWith(error.message)) {
        s = s.slice(error.message.length).trimStart();
      }
      infoItems.push({ name: 'Stack (Raw)', value: s });
    }

    // Component Stack
    if (errorInfo && typeof errorInfo === 'object' && 'componentStack' in errorInfo) {
      infoItems.push({
        name: 'Components',
        value: String((errorInfo as { componentStack: unknown }).componentStack),
      });
    } else {
      infoItems.push({
        name: 'Components',
        value: errorInfo
          ? `(componentStack not set) errorInfo as Json: \n${toJson(errorInfo)}`
          : '(errorInfo was not set)',
      });
    }

    // EnvVars
    try {
      const padLength = envVarDebugAr.max((e) => e.name.length);
      infoItems.push({
        name: 'Environment',
        value: envVarDebugAr.map((e) => `${e.name.padEnd(padLength)}: ${e.value}`).join('\n'),
      });
    } catch (_ex) {
      infoItems.push({ name: 'Environment', value: '(error retreiving env list)' });
    }

    // Location
    try {
      const locationItems = ObjToKv({
        Protocol: window?.location?.protocol ?? '<null>',
        Path: window?.location?.pathname ?? '<null>',
        Search: window?.location?.search ?? '<null>',
        Hash: window?.location?.hash ?? '<null>',
      });
      const padLength = locationItems.max((e) => e.key.length);
      infoItems.push({
        name: 'Location',
        value: locationItems.map((e) => `${e.key.padEnd(padLength)}: ${e.value}`).join('\n'),
      });
    } catch (_ex) {
      infoItems.push({
        name: 'Location',
        value: '(error printing location, please include the url in your bug report)',
      });
    }

    this.setState({
      hasError: true,
      error,
      errorInfo,
      decodingDone: false,
      infoItems,
    });

    // Decode stack trace asynchronously
    if (error?.stack) {
      StackTrace.fromError(error)
        .then((frames) => {
          // Decode Success
          this.setState((prevState) => {
            const newInfoItems = [...prevState.infoItems];
            newInfoItems[decodedStackIndex] = {
              name: 'Stack (Decoded)',
              value: frames.join('\n'),
            };
            return { infoItems: newInfoItems, decodingDone: true };
          });
        })
        .catch((err) => {
          // Decode Error
          this.setState((prevState) => {
            const newInfoItems = [...prevState.infoItems];
            newInfoItems[decodedStackIndex] = {
              name: 'Stack (Decoded)',
              value: `Unable to decode stacktrace\n${String(err)}`,
            };
            return { infoItems: newInfoItems, decodingDone: true };
          });
        });
    } else {
      this.setState({ decodingDone: true });
    }
  }

  getError() {
    let data = '';

    for (const e of this.state.infoItems) {
      data += `${e.name}:\n${e.value}\n\n`;
    }

    return data;
  }

  dismiss = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      decodingDone: false,
      infoItems: [],
    });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Box style={{ minHeight: '100vh', overflow: 'visible', padding: '2rem 4rem' }}>
        <div>
          <h1>Rendering Error!</h1>
          <p>
            Please report this at{' '}
            <a
              href="https://github.com/redpanda-data/console/issues"
              style={{ textDecoration: 'underline', fontWeight: 'bold' }}
            >
              our GitHub Repo
            </a>
          </p>
          <Box mb={2} mt={0}>
            <Button onClick={this.dismiss} size="large" style={{ width: '16rem' }} variant="primary">
              <Icon as={CloseIcon} />
              Dismiss
            </Button>
            <NoClipboardPopover>
              <CopyToClipboardButton
                disabled={!(isClipboardAvailable && this.state.decodingDone)}
                isLoading={!this.state.decodingDone}
                message={this.getError()}
              />
            </NoClipboardPopover>
          </Box>
        </div>
        <Flex flexDirection="column" width="100%">
          {this.state.infoItems.map((e) => (
            <InfoItemDisplay data={e} key={e.name} />
          ))}
        </Flex>
      </Box>
    );
  }
}

const CopyToClipboardButton: FC<{ message: string; disabled: boolean; isLoading: boolean }> = ({
  message,
  disabled,
  isLoading,
}) => {
  const toast = useToast();

  return (
    <Button
      disabled={disabled}
      isLoading={isLoading}
      onClick={() => {
        navigator.clipboard
          .writeText(message)
          .then(() => {
            toast({
              status: 'success',
              description: 'All info copied to clipboard!',
            });
          })
          .catch(navigatorClipboardErrorHandler);
      }}
      size="large"
      variant="ghost"
    >
      <Icon as={CopyAllIcon} />
      Copy Info
    </Button>
  );
};

function InfoItemDisplay({ data }: { data: InfoItem }) {
  const title = data.name;
  let content: React.ReactNode = data.value;

  if (typeof content === 'string') {
    content = content.replace(/\n\s*/g, '\n').trim();
  }

  return (
    <div>
      <h2>{title}</h2>
      <pre style={valueStyle}>{content}</pre>
    </div>
  );
}
