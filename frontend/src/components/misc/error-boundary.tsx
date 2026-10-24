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

import { CloseIcon, CopyAllIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import React, { type FC } from 'react';
import StackTrace from 'stacktrace-js';

import { NoClipboardPopover } from './no-clipboard-popover';
import { envVarDebugAr } from '../../utils/env';
import { isClipboardAvailable } from '../../utils/feature-detection';
import { toJson } from '../../utils/json-utils';
import { showToast } from '../../utils/toast.utils';
import { navigatorClipboardErrorHandler, objToKv } from '../../utils/tsx-utils';

// background       rgb(35, 35, 35)
// div              rgba(206, 17, 38, 0.1)
// title            rgb(232, 59, 70)
// foreground
//    - main        rgb(252, 207, 207)
//    - highligh    rgb(204, 102, 102)
//    - secondary   rgb(135, 142, 145)

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

type ErrorBoundaryProps = { children?: React.ReactNode; fallback?: React.ReactNode };

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(p: ErrorBoundaryProps) {
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
    const { infoItems, decodedStackIndex } = getInitialErrorInfo(error, errorInfo);

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

    if (this.props.fallback !== undefined) {
      return this.props.fallback;
    }

    return (
      <div className="min-h-screen px-16 py-8">
        <div>
          <h1>Rendering Error!</h1>
          <p>
            Please report this at{' '}
            <a className="font-bold underline" href="https://github.com/redpanda-data/console/issues">
              our GitHub Repo
            </a>
          </p>
          <div className="mb-2">
            <Button className="w-64" onClick={this.dismiss} size="lg" variant="primary">
              <CloseIcon />
              Dismiss
            </Button>
            <NoClipboardPopover>
              <CopyToClipboardButton
                disabled={!(isClipboardAvailable && this.state.decodingDone)}
                isLoading={!this.state.decodingDone}
                message={this.getError()}
              />
            </NoClipboardPopover>
          </div>
        </div>
        <div className="flex w-full flex-col">
          {this.state.infoItems.map((e) => (
            <InfoItemDisplay data={e} key={e.name} />
          ))}
        </div>
      </div>
    );
  }
}

const CopyToClipboardButton: FC<{ message: string; disabled: boolean; isLoading: boolean }> = ({
  message,
  disabled,
  isLoading,
}) => (
  <Button
    disabled={disabled}
    isLoading={isLoading}
    onClick={() => {
      navigator.clipboard
        .writeText(message)
        .then(() => {
          showToast({
            status: 'success',
            description: 'All info copied to clipboard',
          });
        })
        .catch(navigatorClipboardErrorHandler);
    }}
    size="lg"
    variant="ghost"
  >
    <CopyAllIcon />
    Copy Info
  </Button>
);

function InfoItemDisplay({ data }: { data: InfoItem }) {
  const title = data.name;
  let content: React.ReactNode = data.value;

  if (typeof content === 'string') {
    content = content.replace(/\n\s*/g, '\n').trim();
  }

  return (
    <div>
      <h2>{title}</h2>
      <pre className="rounded-xs bg-surface-recess p-4 text-body-sm wrap-anywhere whitespace-pre-wrap">{content}</pre>
    </div>
  );
}

function getInitialErrorInfo(error: Error | null, errorInfo: object) {
  const infoItems: InfoItem[] = [];
  if (error?.name && error.name.toLowerCase() !== 'error') {
    infoItems.push({ name: 'Type', value: error.name });
  }
  infoItems.push({ name: 'Message', value: error?.message || '(no message)' });
  const decodedStackIndex = infoItems.length;
  infoItems.push({ name: 'Stack (Decoded)', value: 'Decoding stack trace, please wait...' });
  if (error?.stack) {
    infoItems.push({ name: 'Stack (Raw)', value: getRawErrorStack(error) });
  }
  infoItems.push(getComponentStackInfo(errorInfo), getEnvironmentInfo(), getLocationInfo());
  return { infoItems, decodedStackIndex };
}

function getRawErrorStack(error: Error): string {
  const stack = (error.stack ?? '').removePrefix('error:').trim();
  return error.message && stack.startsWith(error.message) ? stack.slice(error.message.length).trimStart() : stack;
}

function getComponentStackInfo(errorInfo: object): InfoItem {
  return {
    name: 'Components',
    value:
      errorInfo && typeof errorInfo === 'object' && 'componentStack' in errorInfo
        ? String(errorInfo.componentStack)
        : errorInfo
          ? `(componentStack not set) errorInfo as Json: \n${toJson(errorInfo)}`
          : '(errorInfo was not set)',
  };
}

function getEnvironmentInfo(): InfoItem {
  try {
    const padLength = envVarDebugAr.max((entry) => entry.name.length);
    return {
      name: 'Environment',
      value: envVarDebugAr.map((entry) => `${entry.name.padEnd(padLength)}: ${entry.value}`).join('\n'),
    };
  } catch {
    return { name: 'Environment', value: '(error retreiving env list)' };
  }
}

function getLocationInfo(): InfoItem {
  try {
    const items = objToKv({
      Protocol: window?.location?.protocol ?? '<null>',
      Path: window?.location?.pathname ?? '<null>',
      Search: window?.location?.search ?? '<null>',
      Hash: window?.location?.hash ?? '<null>',
    });
    const padLength = items.max((item) => item.key.length);
    return { name: 'Location', value: items.map((item) => `${item.key.padEnd(padLength)}: ${item.value}`).join('\n') };
  } catch {
    return { name: 'Location', value: '(error printing location, please include the url in your bug report)' };
  }
}
