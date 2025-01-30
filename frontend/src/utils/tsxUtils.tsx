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

import { InfoIcon } from '@primer/octicons-react';
import { Skeleton } from '@redpanda-data/ui';
import {
  Box,
  Flex,
  type PlacementWithLogical,
  Progress,
  RadioGroup,
  Button as RpButton,
  type ButtonProps as RpButtonProps,
  Text,
  type ToastId,
  Tooltip,
  createStandaloneToast,
  redpandaTheme,
  redpandaToastOptions,
} from '@redpanda-data/ui';
import { motion } from 'framer-motion';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React, { Component, type CSSProperties, type ReactNode, useState } from 'react';
import { MdContentCopy, MdHelpOutline, MdOutlineDownload } from 'react-icons/md';
import colors from '../colors';
import type { TimestampDisplayFormat } from '../state/ui';
import { animProps } from './animationProps';
import { toJson } from './jsonUtils';
import { DebugTimerStore, prettyMilliseconds, simpleUniqueId } from './utils';

const defaultLocale = 'en';
const thousandsSeperator = (1234).toLocaleString(defaultLocale)[1];
// const decimalSeperator = (0.123).toLocaleString(defaultLocale)[1];

const nbsp = '\xA0'; // non breaking space

export function numberToThousandsString(n: number): JSX.Element {
  if (typeof n !== 'number') return <>{n}</>;

  const parts = n.toLocaleString(defaultLocale).split(thousandsSeperator);
  const separator = nbsp;

  const result: JSX.Element[] = [];
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;

    // Add the number block itself; React.Fragment is used explicitly to avoid missing key warning
    result.push(<React.Fragment key={i}>{parts[i]}</React.Fragment>);

    // Add a dot
    if (!last)
      result.push(
        <span key={`${i}.`} className="noSelect nbspSeparator">
          {separator}
        </span>,
      );
  }

  return <>{result}</>;
}

@observer
export class TimestampDisplay extends Component<{ unixEpochMillisecond: number; format: TimestampDisplayFormat }> {
  render() {
    const { unixEpochMillisecond: ts, format } = this.props;
    if (format === 'relative') DebugTimerStore.Instance.useSeconds();

    switch (format) {
      case 'unixTimestamp':
        return new Date(ts).toUTCString();
      case 'onlyDate':
        return new Date(ts).toLocaleDateString();
      case 'onlyTime':
        return new Date(ts).toLocaleTimeString();
      case 'unixMillis':
        return ts.toString();
      case 'relative':
        return `${prettyMilliseconds(Date.now() - ts, { compact: true })} ago`;
    }

    // format 'default' -> locale datetime
    return new Date(ts).toLocaleString();
  }
}

export const copyIcon = (
  <svg viewBox="0 0 14 16" version="1.1" width="14" height="16" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z"
    />
  </svg>
);

const DefaultQuickTableOptions = {
  tableClassName: undefined as string | undefined,
  keyAlign: 'left' as 'left' | 'right' | 'center',
  valueAlign: 'left' as 'left' | 'right' | 'center',
  gapWidth: '16px' as string | number,
  gapHeight: 0 as string | number,
  keyStyle: undefined as React.CSSProperties | undefined,
  valueStyle: undefined as React.CSSProperties | undefined,
  tableStyle: undefined as React.CSSProperties | undefined,
};
type QuickTableOptions = Partial<typeof DefaultQuickTableOptions>;

// [ { key: 'a', value: 'b' } ]
export function QuickTable(data: { key: any; value: any }[], options?: QuickTableOptions): JSX.Element;
// { 'key1': 'value1', 'key2': 'value2' }
export function QuickTable(data: { [key: string]: any }, options?: QuickTableOptions): JSX.Element;
// [ ['a', 'b'] ]
export function QuickTable(data: [any, any][], options?: QuickTableOptions): JSX.Element;

export function QuickTable(
  data: { key: any; value: any }[] | { [key: string]: any } | [any, any][],
  options?: QuickTableOptions,
): JSX.Element {
  let entries: { key: any; value: any }[];

  // plain object?
  if (typeof data === 'object' && !Array.isArray(data)) {
    // Convert to array of key value objects
    entries = [];
    for (const [k, v] of Object.entries(data)) entries.push({ key: k, value: v });
  }
  // array of [any, any] ?
  else if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    // Convert to array of key-value objects
    entries = (data as [any, any][]).map((ar) => ({ key: ar[0], value: ar[1] }));
  }
  // already correct? array of { key:any, value:any }
  else {
    // Cast to correct type directly
    entries = data as { key: any; value: any }[];
  }

  const o = Object.assign({} as QuickTableOptions, DefaultQuickTableOptions, options);

  const showVerticalGutter = (typeof o.gapHeight === 'number' && o.gapHeight > 0) || typeof o.gapHeight === 'string';
  const classNames = [o.tableClassName, 'quickTable'].joinStr(' ');

  return (
    <table className={classNames} style={o.tableStyle}>
      <tbody>
        {entries.map((obj, i) => (
          <React.Fragment key={i}>
            <tr>
              <td style={{ textAlign: o.keyAlign, ...o.keyStyle }} className="keyCell">
                {React.isValidElement(obj.key) ? obj.key : toSafeString(obj.key)}
              </td>
              <td style={{ minWidth: '0px', width: o.gapWidth, padding: '0px' }} />
              <td style={{ textAlign: o.valueAlign, ...o.valueStyle }} className="valueCell">
                {React.isValidElement(obj.value) ? obj.value : toSafeString(obj.value)}
              </td>
            </tr>

            {showVerticalGutter && i < entries.length - 1 && (
              <tr>
                <td style={{ padding: 0, paddingBottom: o.gapHeight }} />
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

export function toSafeString(x: any): string {
  if (typeof x === 'undefined' || x === null) return '';
  if (typeof x === 'string') return x;
  if (typeof x === 'boolean' || typeof x === 'number') return String(x);
  return toJson(x);
}

export function ObjToKv(obj: any): { key: string; value: any }[] {
  const ar = [] as { key: string; value: any }[];
  for (const k in obj) {
    ar.push({ key: k, value: obj[k] });
  }
  return ar;
}

const style_flexColumn: CSSProperties = { display: 'flex', flexDirection: 'column' };
export const Label = (p: {
  text: string;
  textSuffix?: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
  required?: boolean;
}) => {
  const [id] = useState(() => simpleUniqueId(p.text));

  const child: React.ReactNode = p.children ?? <React.Fragment />;

  const newChild = Object.assign({}, child) as any;
  newChild.props = {};
  Object.assign(newChild.props, (child as any).props, { id: id });

  const divStyle = p.style ? { ...p.style, ...style_flexColumn } : p.style;

  const labelClasses = ['labelText'];
  if (p.required) labelClasses.push('required');

  // <label className="label">
  //     <span className="title">{p.text}</span>
  //     {p.children}
  // </label>

  return (
    <>
      <div className={p.className} style={divStyle}>
        <div className={labelClasses.join(' ')}>
          <label htmlFor={id}>
            {p.text} {p.textSuffix}
          </label>
        </div>
        <div>{newChild}</div>
      </div>
    </>
  );
};

export function findPopupContainer(current: HTMLElement): HTMLElement {
  let container = current;
  while (true) {
    const p = container.parentElement;
    if (!p) return container;

    if (p.className.includes('kowlCard')) return p;
    if (p.clientWidth >= 300 && p.clientHeight >= 300) return p;

    container = p;
  }
}

export const InfoText = (p: {
  tooltip: React.ReactNode;
  children?: React.ReactNode;
  tooltipOverText?: boolean;

  iconColor?: string;
  iconSize?: string;
  icon?: React.ReactNode;

  maxWidth?: string;
  align?: 'center' | 'left';
  placement?: PlacementWithLogical;

  gap?: string;
  transform?: string;
}) => {
  const overlay =
    p.maxWidth || p.align ? <div style={{ maxWidth: p.maxWidth, textAlign: p.align }}>{p.tooltip}</div> : p.tooltip;

  const size = p.iconSize ?? '14px';
  const gap = p.gap ?? '4px';

  const gray = 'hsl(0deg, 0%, 50%)';
  // const blue = 'hsl(209deg, 100%, 55%)';
  const color = p.iconColor ?? gray;
  const placement = p.placement ?? 'top';

  const icon = (
    <span
      style={{
        color: color,
        display: 'inline-flex',
        boxSizing: 'content-box',
        width: size,
        height: size,
        marginLeft: gap,
        transform: p.transform,
      }}
    >
      {p.icon ?? <InfoIcon />}
    </span>
  );

  if (p.tooltipOverText === true)
    return (
      <Tooltip label={overlay} placement={placement} hasArrow>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {p.children}
          {icon}
        </span>
      </Tooltip>
    );

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {p.children}
      <Tooltip label={overlay} placement={placement} hasArrow>
        {icon}
      </Tooltip>
    </span>
  );
};

export class OptionGroup<T extends string> extends Component<{
  label: string;
  options: { [key: string]: any };
  value: T;
  onChange: (value: T) => void;
  children?: never;
  style?: CSSProperties;
}> {
  render() {
    const p = this.props;

    return (
      <Label text={p.label}>
        <RadioGroup
          name={p.label}
          value={p.value}
          onChange={(val) => {
            p.onChange(val);
          }}
          options={ObjToKv(p.options).map((kv) => ({
            value: kv.value,
            label: kv.key,
          }))}
        />
      </Label>
    );
  }
}

export class RadioOptionGroup<T extends string | null = string> extends Component<{
  options: {
    key?: any;
    value: T;
    title: string;
    subTitle: string;
    content?: ReactNode;
  }[];
  value?: T;
  onChange: (value: T) => void;
  showContent?: 'always' | 'onlyWhenSelected';
  disabled?: boolean;
  children?: never;
}> {
  render() {
    const p = this.props;

    return (
      <RadioGroup
        direction="column"
        // TODO - we need to make the API more TS safe and make name optional
        name=""
        // @ts-ignore
        value={p.value}
        // @ts-ignore
        onChange={p.onChange}
        // @ts-ignore
        options={p.options.map((kv) => ({
          value: kv.value,
          disabled: p.disabled,
          label: (
            <Box p={3}>
              <Text fontWeight={500}>{kv.title}</Text>
              <Text color="gray.500">{kv.subTitle}</Text>
              {kv.content && (p.showContent === 'always' || p.value === kv.value) && (
                <Box key={String(kv.value)} style={{ marginLeft: '27px', marginTop: '12px' }}>
                  <div>{kv.content}</div>
                </Box>
              )}
            </Box>
          ),
        }))}
      />
    );
  }
}

interface StatusIndicatorProps {
  identityKey: string;
  fillFactor: number;
  statusText: string;
  bytesConsumed?: string;
  messagesConsumed?: string;
  progressText: string;
}

// TODO - once StatusIndicator is migrated to FC, we could should move this code to use useToast()
const { ToastContainer, toast } = createStandaloneToast({
  theme: redpandaTheme,
  defaultOptions: {
    ...redpandaToastOptions.defaultOptions,
    isClosable: false,
  },
});

@observer
export class StatusIndicator extends Component<StatusIndicatorProps> {
  toastRef: ToastId | null = null;

  timerHandle: NodeJS.Timeout;
  lastUpdateTimestamp: number;
  @observable showWaitingText: boolean;

  // used to fetch 'showWaitingText' (so mobx triggers a re-render).
  // we could just store the value in a local as well, but that might be opimized out.
  mobxSink: any | undefined = undefined;

  constructor(p: any) {
    super(p);

    // Periodically check if we got any new messages. If not, show a different text after some time
    this.lastUpdateTimestamp = Date.now();
    this.showWaitingText = false;
    const waitMessageDelay = 3000;
    this.timerHandle = setInterval(() => {
      const age = Date.now() - this.lastUpdateTimestamp;
      if (age > waitMessageDelay) {
        this.showWaitingText = true;
      }
    }, 300);

    makeObservable(this);
  }

  componentDidMount() {
    this.lastUpdateTimestamp = Date.now();
    this.customRender();
  }

  lastPropsJson = '';
  lastProps = {};
  componentDidUpdate() {
    const curJson = toJson(this.props);
    if (curJson === this.lastPropsJson) {
      // changes to observables
      this.customRender();
      return;
    }

    this.lastPropsJson = curJson;

    this.lastUpdateTimestamp = Date.now();
    if (this.showWaitingText) this.showWaitingText = false;

    this.customRender();
  }

  componentWillUnmount() {
    clearInterval(this.timerHandle);
    this.toastRef && toast.close(this.toastRef);
    this.toastRef = null;
  }

  customRender() {
    const content = (
      <Box mb="0.2em">
        <Box minW={300}>
          <Progress
            value={this.props.fillFactor * 100}
            isIndeterminate={this.props.statusText === 'Connecting'}
            colorScheme="blue"
          />
        </Box>
        <Flex fontSize="sm" fontWeight="bold">
          <div>{this.showWaitingText ? 'Redpanda Console is waiting for new messages...' : this.props.statusText}</div>
          <Text ml="auto" pl="2em">
            {this.props.progressText}
          </Text>
        </Flex>
        {this.props.bytesConsumed && this.props.messagesConsumed && (
          <Flex fontSize="sm" fontWeight="bold" justifyContent="space-between">
            <Flex alignItems="center" gap={2}>
              <MdOutlineDownload color={colors.brandOrange} size={14} /> {this.props.bytesConsumed}
            </Flex>
            <Flex alignItems="center" gap={2}>
              <MdContentCopy color={colors.brandOrange} size={14} /> {this.props.messagesConsumed} messages
            </Flex>
          </Flex>
        )}
      </Box>
    );

    if (this.toastRef === null) {
      this.toastRef = toast({
        status: 'info',
        description: content,
        duration: null,
      });
    } else {
      toast.update(this.toastRef, {
        description: content,
        duration: null,
      });
    }
  }

  render() {
    // workaround to propagate the update (timer -> mobx -> re-render)
    this.mobxSink = this.showWaitingText;
    return <ToastContainer />;
  }
}

export class ZeroSizeWrapper extends Component<{
  width?: string;
  height?: string;
  justifyContent?: string;
  alignItems?: string;
  positionContentAbsolute?: boolean;
  transform?: string;
  wrapperStyle?: CSSProperties;
  children?: React.ReactNode;
}> {
  static readonly style: CSSProperties = {
    display: 'inline-flex',
    width: '0px',
    height: '0px',
    transform: 'translateY(-0.5px)',
    // zIndex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  };

  render() {
    const p = this.props;
    let style = ZeroSizeWrapper.style;
    if (p.width || p.height || p.justifyContent || p.alignItems || p.transform || p.wrapperStyle) {
      style = Object.assign({}, style, p, p.wrapperStyle);
    }

    return (
      <span className="verticalCenter" style={style}>
        <span style={p.positionContentAbsolute ? { position: 'absolute' } : undefined}>{this.props.children}</span>
      </span>
    );
  }
}

const defaultSkeletonStyle = { margin: '2rem' };
const innerSkeleton = <Skeleton noOfLines={8} height={4} />;
export const DefaultSkeleton = (
  <motion.div {...animProps} key={'defaultSkeleton'} style={defaultSkeletonStyle}>
    {innerSkeleton}
  </motion.div>
);

export const InlineSkeleton = (p: { width: string | number }) => (
  <Skeleton noOfLines={1} height={2} width={p.width} display="flex" alignItems="center" />
);

// Single line string, no wrapping, will not overflow and display ellipsis instead
// const ellipsisDivStyle: CSSProperties = {
//     display: 'inline-block',
//     width: 0,
//     minWidth: '100%',
//     overflow: 'hidden',
//     textOverflow: 'ellipsis',
//     whiteSpace: 'nowrap',
//     verticalAlign: 'text-bottom',
// };
const ellipsisSpanStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  maxWidth: '100%',
  verticalAlign: 'text-bottom',
};
export const Ellipsis = (p: { children?: React.ReactNode; className?: string }) => {
  return (
    <span className={p.className} style={ellipsisSpanStyle}>
      {p.children}
    </span>
  );
};

export const Code = (p: { children?: React.ReactNode; nowrap?: boolean }) => {
  const className = p.nowrap ? 'codeBox nowrap' : 'codeBox';
  return <span className={className}>{p.children}</span>;
};

export function LabelTooltip(p: {
  children?: React.ReactNode;
  width?: number;
  maxW?: number;
  nowrap?: boolean;
  left?: boolean;
}) {
  const style: CSSProperties = {};

  if (typeof p.width === 'number') style.width = `${p.width}px`;
  if (p.nowrap === true) style.whiteSpace = 'nowrap';
  if (p.left === true) style.textAlign = 'left';

  const content = <div style={style}>{p.children}</div>;

  return (
    <Tooltip label={content} placement="top" hasArrow maxW={p.maxW}>
      <Box display="inline-block" transform="translateY(2px)">
        <MdHelpOutline size={13} />
      </Box>
    </Tooltip>
  );
}

export type ButtonProps = Omit<RpButtonProps, 'disabled' | 'isDisabled'> & { disabledReason?: string };
export function Button(p: ButtonProps) {
  if (!p.disabledReason) return <RpButton {...p} />;

  const reason = p.disabledReason;
  const btnProps = { ...p };
  btnProps.disabledReason = undefined;

  return (
    <Tooltip placement="top" label={reason} hasArrow>
      <RpButton {...btnProps} isDisabled className={`${p.className ?? ''} disabled`} onClick={undefined} />
    </Tooltip>
  );
}

export function IconButton(p: {
  onClick?: React.MouseEventHandler<HTMLElement>;
  children?: React.ReactNode;
  disabledReason?: string;
}) {
  if (!p.disabledReason) {
    return (
      <span className="iconButton" onClick={p.onClick}>
        {p.children}
      </span>
    );
  }

  return (
    <Tooltip placement="top" label={p.disabledReason} hasArrow>
      <span className="iconButton disabled">{p.children}</span>
    </Tooltip>
  );
}

export const navigatorClipboardErrorHandler = (e: DOMException) => {
  toast({
    status: 'error',
    description: 'Unable to copy settings to clipboard. See console for more information.',
  });
  console.error('unable to copy settings to clipboard', { error: e });
};
