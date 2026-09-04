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

import { type PlacementWithLogical, RadioGroup, Skeleton, Tooltip } from '@redpanda-data/ui';
import { CopyIcon, DownloadIcon, InfoIcon } from 'components/icons';
import { motion } from 'motion/react';
import React, { Component, type CSSProperties, type JSX, useEffect, useState } from 'react';

import { animProps } from './animation-props';
import { toJson } from './json-utils';
import { closeToast, showToast, updateToast } from './toast.utils';
import { prettyMilliseconds, simpleUniqueId } from './utils';
import type { TimestampDisplayFormat } from '../state/ui';

const defaultLocale = 'en';
const thousandsSeperator = (1234).toLocaleString(defaultLocale)[1];
// const decimalSeperator = (0.123).toLocaleString(defaultLocale)[1];

const nbsp = '\xA0'; // non breaking space

export function numberToThousandsString(n: number): JSX.Element {
  if (typeof n !== 'number') {
    return <>{n}</>;
  }

  const parts = n.toLocaleString(defaultLocale).split(thousandsSeperator);
  const separator = nbsp;

  const result: JSX.Element[] = [];
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;

    // Add the number block itself; React.Fragment is used explicitly to avoid missing key warning
    result.push(<React.Fragment key={i}>{parts[i]}</React.Fragment>);

    // Add a dot
    if (!last) {
      result.push(
        <span className="noSelect nbspSeparator" key={`${i}.`}>
          {separator}
        </span>
      );
    }
  }

  return <>{result}</>;
}

export function TimestampDisplay({
  unixEpochMillisecond: ts,
  format,
}: {
  unixEpochMillisecond: number;
  format: TimestampDisplayFormat;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (format !== 'relative') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [format]);

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
    default:
      // format 'default' -> locale datetime
      return new Date(ts).toLocaleString();
  }
}

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
// { 'key1': 'value1', 'key2': 'value2' }
// [ ['a', 'b'] ]
export function QuickTable(
  data:
    | [React.ReactNode, React.ReactNode][]
    | { [key: string]: React.ReactNode }
    | { key: React.ReactNode; value: React.ReactNode }[],
  options?: QuickTableOptions
): JSX.Element;

export function QuickTable(
  data:
    | { key: React.ReactNode; value: React.ReactNode }[]
    | { [key: string]: React.ReactNode }
    | [React.ReactNode, React.ReactNode][],
  options?: QuickTableOptions
): JSX.Element {
  let entries: { key: React.ReactNode; value: React.ReactNode }[];

  // plain object?
  if (typeof data === 'object' && !Array.isArray(data)) {
    // Convert to array of key value objects
    entries = [];
    for (const [k, v] of Object.entries(data)) {
      entries.push({ key: k, value: v });
    }
  }
  // array of [any, any] ?
  else if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    // Convert to array of key-value objects
    entries = (data as [React.ReactNode, React.ReactNode][]).map((ar) => ({ key: ar[0], value: ar[1] }));
  }
  // already correct? array of { key:any, value:any }
  else {
    // Cast to correct type directly
    entries = data as { key: React.ReactNode; value: React.ReactNode }[];
  }

  const o = Object.assign({} as QuickTableOptions, DefaultQuickTableOptions, options);

  const showVerticalGutter = (typeof o.gapHeight === 'number' && o.gapHeight > 0) || typeof o.gapHeight === 'string';
  const classNames = [o.tableClassName, 'quickTable'].joinStr(' ');

  return (
    <table className={classNames} style={o.tableStyle}>
      <tbody>
        {entries.map((obj, i) => (
          <React.Fragment key={`${toSafeString(obj.key)}-${i}`}>
            <tr>
              <td className="keyCell" style={{ textAlign: o.keyAlign, ...o.keyStyle }}>
                {React.isValidElement(obj.key) ? obj.key : toSafeString(obj.key)}
              </td>
              <td style={{ minWidth: '0px', width: o.gapWidth, padding: '0px' }} />
              <td className="valueCell" style={{ textAlign: o.valueAlign, ...o.valueStyle }}>
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

export function toSafeString(x: unknown): string {
  if (typeof x === 'undefined' || x === null) {
    return '';
  }
  if (typeof x === 'string') {
    return x;
  }
  if (typeof x === 'boolean' || typeof x === 'number') {
    return String(x);
  }
  return toJson(x);
}

export function ObjToKv(obj: Record<string, unknown>): { key: string; value: unknown }[] {
  const ar = [] as { key: string; value: unknown }[];
  for (const k in obj) {
    if (Object.hasOwn(obj, k)) {
      ar.push({ key: k, value: obj[k] });
    }
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

  // biome-ignore lint/style/useObjectSpread: ReactNode cannot be spread safely
  const newChild = Object.assign({}, child) as { props?: Record<string, unknown> };
  newChild.props = {};
  Object.assign(newChild.props, (child as { props?: Record<string, unknown> }).props, { id });

  const divStyle = p.style ? { ...p.style, ...style_flexColumn } : p.style;

  const labelClasses = ['labelText'];
  if (p.required) {
    labelClasses.push('required');
  }

  // <label className="label">
  //     <span className="title">{p.text}</span>
  //     {p.children}
  // </label>

  return (
    <div className={p.className} style={divStyle}>
      <div className={labelClasses.join(' ')}>
        <label htmlFor={id}>
          {p.text} {p.textSuffix}
        </label>
      </div>
      <div>{newChild as React.ReactElement}</div>
    </div>
  );
};

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

  const gray = 'var(--color-subtle)';
  // const blue = 'hsl(209deg, 100%, 55%)';
  const color = p.iconColor ?? gray;
  const placement = p.placement ?? 'top';

  const icon = (
    <span
      style={{
        color,
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

  if (p.tooltipOverText === true) {
    return (
      <Tooltip hasArrow label={overlay} placement={placement}>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {p.children}
          {icon}
        </span>
      </Tooltip>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {p.children}
      <Tooltip hasArrow label={overlay} placement={placement}>
        {icon}
      </Tooltip>
    </span>
  );
};

export class OptionGroup<T extends string> extends Component<{
  label: string;
  options: { [key: string]: string };
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
          onChange={(val) => {
            p.onChange(val);
          }}
          options={ObjToKv(p.options).map((kv) => ({
            value: String(kv.value),
            label: kv.key,
          }))}
          value={p.value}
        />
      </Label>
    );
  }
}

type StatusIndicatorProps = {
  identityKey: string;
  fillFactor: number;
  statusText: string;
  bytesConsumed?: string;
  messagesConsumed?: string;
  progressText: string;
};

export class StatusIndicator extends Component<StatusIndicatorProps, { showWaitingText: boolean }> {
  toastRef: string | null = null;
  dismissed = false;

  timerHandle: NodeJS.Timeout;
  lastUpdateTimestamp: number;

  state = { showWaitingText: false };

  constructor(p: StatusIndicatorProps) {
    super(p);

    // Periodically check if we got any new messages. If not, show a different text after some time
    this.lastUpdateTimestamp = Date.now();
    const waitMessageDelay = 3000;
    this.timerHandle = setInterval(() => {
      const age = Date.now() - this.lastUpdateTimestamp;
      if (age > waitMessageDelay) {
        this.setState({ showWaitingText: true });
      }
    }, 300);
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
    if (this.state.showWaitingText) {
      this.setState({ showWaitingText: false });
    }

    this.customRender();
  }

  componentWillUnmount() {
    clearInterval(this.timerHandle);
    if (this.toastRef) {
      closeToast(this.toastRef);
    }
    this.toastRef = null;
  }

  customRender() {
    if (this.dismissed) {
      return;
    }
    const indeterminate = this.props.statusText === 'Connecting';
    const percent = Math.round(this.props.fillFactor * 100);
    const showCounters = Boolean(this.props.bytesConsumed && this.props.messagesConsumed);

    // The toast description is a <p>, so this stays phrasing content (spans, no Progress).
    const content = (
      <span className="flex flex-col gap-1 text-body text-foreground">
        <span
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={indeterminate ? undefined : percent}
          className="block h-2 w-full overflow-hidden rounded-full bg-surface-subtle"
          role="progressbar"
        >
          <span
            className={
              indeterminate
                ? 'block h-full w-full animate-pulse rounded-full bg-primary'
                : 'block h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none'
            }
            style={indeterminate ? undefined : { width: `${percent}%` }}
          />
        </span>
        <span className="flex font-semibold">
          <span>
            {this.state.showWaitingText ? 'Redpanda Console is waiting for new messages...' : this.props.statusText}
          </span>
          <span className="ml-auto pl-8">{this.props.progressText}</span>
        </span>
        {showCounters ? (
          <span className="flex justify-between font-semibold">
            <span className="inline-flex items-center gap-2">
              <DownloadIcon className="text-brand" size={14} /> {this.props.bytesConsumed}
            </span>
            <span className="inline-flex items-center gap-2">
              <CopyIcon className="text-brand" size={14} /> {this.props.messagesConsumed} messages
            </span>
          </span>
        ) : null}
      </span>
    );

    if (this.toastRef === null) {
      this.toastRef = showToast({
        status: 'info',
        description: content,
        duration: null,
        // A closed progress toast stays closed for this search.
        onClose: () => {
          this.toastRef = null;
          this.dismissed = true;
        },
      });
    } else {
      updateToast(this.toastRef, { description: content });
    }
  }

  render() {
    return null;
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
      style = { ...style, ...p, ...p.wrapperStyle };
    }

    return (
      <span className="verticalCenter" style={style}>
        <span style={p.positionContentAbsolute ? { position: 'absolute' } : undefined}>{this.props.children}</span>
      </span>
    );
  }
}

const defaultSkeletonStyle = { margin: '2rem' };
const innerSkeleton = <Skeleton height={4} noOfLines={8} />;
export const DefaultSkeleton = (
  <motion.div {...animProps} key={'defaultSkeleton'} style={defaultSkeletonStyle}>
    {innerSkeleton}
  </motion.div>
);

// Single line, no wrapping; overflow shows an ellipsis.
const ellipsisSpanStyle: CSSProperties = {
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  maxWidth: '100%',
  verticalAlign: 'text-bottom',
};
export const Ellipsis = (p: { children?: React.ReactNode; className?: string }) => (
  <span className={p.className} style={ellipsisSpanStyle}>
    {p.children}
  </span>
);

export const Code = (p: { children?: React.ReactNode; nowrap?: boolean }) => {
  const className = p.nowrap ? 'codeBox nowrap' : 'codeBox';
  return <span className={className}>{p.children}</span>;
};

export const navigatorClipboardErrorHandler = (e: DOMException) => {
  showToast({
    status: 'error',
    duration: 5000,
    description: 'Unable to copy settings to clipboard. See console for more information.',
  });
  // biome-ignore lint/suspicious/noConsole: error logging for debugging clipboard failures
  console.error('unable to copy settings to clipboard', { error: e });
};
