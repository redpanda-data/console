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
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React, { type CSSProperties, type FC } from 'react';
import { MdClose, MdOutlineCopyAll } from 'react-icons/md';
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
  value: string | (() => React.ReactNode);
};

@observer
export class ErrorBoundary extends React.Component<{ children?: React.ReactNode }> {
  @observable hasError = false;
  error: Error | null = null;
  errorInfo: object | null = null;
  @observable decodingDone = false;

  @observable infoItems: InfoItem[] = [];

  constructor(p: { children?: React.ReactNode }) {
    super(p);
    makeObservable(this);
  }

  componentDidCatch(error: Error | null, errorInfo: object) {
    this.error = error;
    this.errorInfo = errorInfo;
    this.decodingDone = false;

    this.infoItems = [];

    // Type
    if (this.error?.name && this.error.name.toLowerCase() !== 'error') {
      this.infoItems.push({ name: 'Type', value: this.error.name });
    }

    // Message
    if (this.error?.message) {
      this.infoItems.push({ name: 'Message', value: this.error.message });
    } else {
      this.infoItems.push({ name: 'Message', value: '(no message)' });
    }

    // Call Stack
    if (this.error?.stack) {
      const dataHolder = observable({
        value: null as null | string,
      });

      this.infoItems.push({
        name: 'Stack (Decoded)',
        value: () => {
          if (dataHolder.value == null) {
            return <div style={{ fontSize: '2rem' }}>Decoding stack trace, please wait...</div>;
          }
          return dataHolder.value;
        },
      });

      StackTrace.fromError(this.error)
        .then((frames) => {
          // Decode Success
          dataHolder.value = frames.join('\n');
          this.decodingDone = true;
        })
        .catch((err) => {
          // Decode Error
          dataHolder.value = `Unable to decode stacktrace\n${String(err)}`;
          this.decodingDone = true;
        });

      // Normal stack trace
      let s = this.error.stack;
      // remove "Error: " prefix
      s = s.removePrefix('error:').trim();
      // remove the error message as well, leaving only the stack trace
      if (this.error.message && s.startsWith(this.error.message)) {
        s = s.slice(this.error.message.length).trimStart();
      }
      this.infoItems.push({ name: 'Stack (Raw)', value: s });
    }

    // Component Stack
    if (this.errorInfo && typeof this.errorInfo === 'object' && 'componentStack' in this.errorInfo) {
      this.infoItems.push({
        name: 'Components',
        value: String((this.errorInfo as { componentStack: unknown }).componentStack),
      });
    } else {
      this.infoItems.push({
        name: 'Components',
        value: this.errorInfo
          ? `(componentStack not set) errorInfo as Json: \n${toJson(this.errorInfo)}`
          : '(errorInfo was not set)',
      });
    }

    // EnvVars
    try {
      const padLength = envVarDebugAr.max((e) => e.name.length);
      this.infoItems.push({
        name: 'Environment',
        value: envVarDebugAr.map((e) => `${e.name.padEnd(padLength)}: ${e.value}`).join('\n'),
      });
    } catch (_ex) {
      this.infoItems.push({ name: 'Environment', value: '(error retreiving env list)' });
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
      this.infoItems.push({
        name: 'Location',
        value: locationItems.map((e) => `${e.key.padEnd(padLength)}: ${e.value}`).join('\n'),
      });
    } catch (_ex) {
      this.infoItems.push({
        name: 'Location',
        value: '(error printing location, please include the url in your bug report)',
      });
    }

    this.hasError = true;
  }

  getError() {
    let data = '';

    for (const e of this.infoItems) {
      const str = getStringFromInfo(e);
      data += `${e.name}:\n${str}\n\n`;
    }

    return data;
  }

  dismiss() {
    this.error = null;
    this.errorInfo = null;
    this.hasError = false;
    this.decodingDone = false;
  }

  render() {
    if (!this.hasError) {
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
            <Button onClick={() => this.dismiss()} size="large" style={{ width: '16rem' }} variant="primary">
              <Icon as={MdClose} />
              Dismiss
            </Button>
            <NoClipboardPopover>
              <CopyToClipboardButton
                disabled={!(isClipboardAvailable && this.decodingDone)}
                isLoading={!this.decodingDone}
                message={this.getError()}
              />
            </NoClipboardPopover>
          </Box>
        </div>
        <Flex flexDirection="column" width="100%">
          {this.infoItems.map((e) => (
            <InfoItemDisplay data={e} key={e.name} />
          ))}
        </Flex>
      </Box>
    );
  }
}

function getStringFromInfo(info: InfoItem) {
  if (!info) {
    return '';
  }

  if (typeof info.value === 'string') {
    return info.value;
  }
  try {
    const r = info.value();
    return String(r);
  } catch (err) {
    return `Error calling infoItem func: ${err}`;
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
      <Icon as={MdOutlineCopyAll} />
      Copy Info
    </Button>
  );
};

@observer
export class InfoItemDisplay extends React.Component<{ data: InfoItem }> {
  render() {
    const title = this.props.data.name;
    const value = this.props.data.value;
    let content: React.ReactNode;
    if (typeof value === 'string') {
      content = value;
    } else {
      try {
        content = value();
      } catch (err) {
        content = `error rendering: ${String(err)}`;
      }
    }

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
}
