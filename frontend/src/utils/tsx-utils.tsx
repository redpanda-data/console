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

import { CopyIcon, DownloadIcon, InfoIcon } from 'components/icons';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Table } from 'components/redpanda-ui/components/table';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { cn } from 'components/redpanda-ui/lib/utils';
import { motion } from 'motion/react';
import React, { Component, type CSSProperties, type JSX, useEffect, useId, useState } from 'react';

import './tsx-utils.css';

import { animProps } from './animation-props';
import { toJson } from './json-utils';
import { isNonEmptyString } from './string-utils';
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

  const result: JSX.Element[] = [];
  let decimalPlace = (parts.length - 1) * 3;
  for (const part of parts) {
    result.push(
      <React.Fragment key={decimalPlace}>
        {part}
        {decimalPlace > 0 && <span className="noSelect nbspSeparator">{nbsp}</span>}
      </React.Fragment>
    );
    decimalPlace -= 3;
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
    if (format !== 'relative') {
      return;
    }
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
    case 'default':
    default:
      // format 'default' -> locale datetime
      return new Date(ts).toLocaleString();
  }
}

type QuickTableOptions = {
  keyAlign?: 'left' | 'right' | 'center';
  valueAlign?: 'left' | 'right' | 'center';
  gapWidth?: string | number;
  gapHeight?: string | number;
  keyClassName?: string;
  valueClassName?: string;
};
type QuickTableEntry = { key: React.ReactNode; value: React.ReactNode };
type QuickTableData = QuickTableEntry[] | [React.ReactNode, React.ReactNode][] | Record<string, React.ReactNode>;
type HelperStyleVars = CSSProperties & { [key: `--console-${string}`]: string | number | undefined };

function cssLength(value: string | number | undefined): string | undefined {
  return typeof value === 'number' ? `${value}px` : value;
}

export function quickTable(data: QuickTableData, options?: QuickTableOptions): JSX.Element {
  const entries: QuickTableEntry[] = Array.isArray(data)
    ? data.map((entry) => (Array.isArray(entry) ? { key: entry[0], value: entry[1] } : entry))
    : Object.entries(data).map(([key, value]) => ({ key, value }));
  const o = { keyAlign: 'left', valueAlign: 'left', gapWidth: '16px', gapHeight: 0, ...options };
  const showVerticalGutter = (typeof o.gapHeight === 'number' && o.gapHeight > 0) || typeof o.gapHeight === 'string';
  const tableStyle: HelperStyleVars = {
    '--console-table-gap-width': cssLength(o.gapWidth),
    '--console-table-gap-height': cssLength(o.gapHeight),
  };
  const occurrences = new Map<string, number>();
  const rows = entries.map((entry) => {
    const label = toSafeString(entry.key);
    const occurrence = occurrences.get(label) ?? 0;
    occurrences.set(label, occurrence + 1);
    return { ...entry, rowKey: `${label}:${occurrence}` };
  });
  return (
    <Table className="quickTable w-auto" size={null} style={tableStyle} variant="simple">
      <tbody>
        {rows.map((entry) => (
          <React.Fragment key={entry.rowKey}>
            <tr>
              <td
                className={cn(
                  o.keyClassName,
                  o.keyAlign === 'right' ? 'text-right' : o.keyAlign === 'center' ? 'text-center' : 'text-left'
                )}
              >
                {React.isValidElement(entry.key) ? entry.key : toSafeString(entry.key)}
              </td>
              <td className="console-table-gap" />
              <td
                className={cn(
                  o.valueClassName,
                  o.valueAlign === 'right' ? 'text-right' : o.valueAlign === 'center' ? 'text-center' : 'text-left'
                )}
              >
                {React.isValidElement(entry.value) ? entry.value : toSafeString(entry.value)}
              </td>
            </tr>
            {showVerticalGutter && entry !== rows.at(-1) && (
              <tr>
                <td className="console-table-row-gap" />
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </Table>
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
export function objToKv(obj: Record<string, unknown>): {
  key: string;
  value: unknown;
}[] {
  const ar = [] as {
    key: string;
    value: unknown;
  }[];
  const propertyNames = Object.keys(obj ?? {});
  for (const k of propertyNames) {
    if (Object.hasOwn(obj, k)) {
      ar.push({ key: k, value: obj[k] });
    }
  }
  return ar;
}

function withChildId(child: React.ReactNode, id: string): React.ReactNode {
  return React.isValidElement<Record<string, unknown>>(child) ? React.cloneElement(child, { id }) : child;
}

export const Label = (p: {
  text: string;
  textSuffix?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  required?: boolean;
  /** Id of the labellable control inside `children`. When set, the child is rendered as-is. */
  htmlFor?: string;
}) => {
  const [generatedId] = useState(() => simpleUniqueId(p.text));
  const id = p.htmlFor ?? generatedId;

  const child: React.ReactNode = p.children ?? <React.Fragment />;

  const renderedChild = p.htmlFor === undefined ? withChildId(child, id) : child;

  const labelClasses = ['labelText'];
  if (p.required === true) {
    labelClasses.push('required');
  }

  return (
    <div className={p.className}>
      <div className={labelClasses.join(' ')}>
        <label htmlFor={id}>{p.text}</label> {p.textSuffix}
      </div>
      <div>{renderedChild}</div>
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
  placement?: 'top' | 'bottom' | 'left' | 'right';

  gap?: string;
  transform?: string;
}) => {
  const overlayStyle: HelperStyleVars = { '--console-info-max-width': p.maxWidth, '--console-info-align': p.align };
  const overlay =
    (p.maxWidth ?? '') || p.align ? (
      <div className="console-info-overlay" style={overlayStyle}>
        {p.tooltip}
      </div>
    ) : (
      p.tooltip
    );

  const iconStyle: HelperStyleVars = {
    '--console-info-color': p.iconColor ?? 'var(--color-subtle)',
    '--console-info-size': p.iconSize ?? '14px',
    '--console-info-gap': p.gap ?? '4px',
    '--console-info-transform': p.transform,
  };
  const icon = (
    <span className="console-info-icon" style={iconStyle}>
      {p.icon ?? <InfoIcon />}
    </span>
  );

  const tooltip = (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex items-center" />}>
        {p.tooltipOverText === true ? p.children : null}
        {icon}
      </TooltipTrigger>
      <TooltipContent side={p.placement ?? 'top'}>{overlay}</TooltipContent>
    </Tooltip>
  );

  if (p.tooltipOverText === true) {
    return tooltip;
  }

  return (
    <span className="inline-flex items-center">
      {p.children}
      {tooltip}
    </span>
  );
};

export function OptionGroup<T extends string>(p: {
  label: string;
  options: Record<string, T>;
  value: T;
  onChange: (value: T) => void;
  children?: never;
  style?: CSSProperties;
}) {
  const captionId = useId();

  return (
    <div>
      <div className="labelText" id={captionId}>
        {p.label}
      </div>
      <div>
        <ToggleGroup
          aria-labelledby={captionId}
          onValueChange={([next]) => {
            // Single-select: ignore the deselect that toggling the active segment reports.
            const selected = Object.values(p.options).find((option) => option === next);
            if (selected !== undefined && selected !== p.value) {
              p.onChange(selected);
            }
          }}
          value={[p.value]}
          variant="outline"
        >
          {Object.entries(p.options).map(([label, value]) => (
            <ToggleGroupItem key={label} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

type StatusIndicatorProps = {
  identityKey: string;
  fillFactor: number;
  statusText: string;
  bytesConsumed?: string;
  messagesConsumed?: string;
  progressText: string;
};
export class StatusIndicator extends Component<
  StatusIndicatorProps,
  {
    showWaitingText: boolean;
  }
> {
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
    if (isNonEmptyString(this.toastRef)) {
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
    const showCounters = Boolean(isNonEmptyString(this.props.bytesConsumed) && this.props.messagesConsumed);

    // The toast description is a <p>, so this stays phrasing content (spans, no Progress).
    const progressStyle: HelperStyleVars = { '--console-progress-width': `${percent}%` };
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
                ? 'block size-full animate-pulse rounded-full bg-primary'
                : 'console-status-progress block h-full rounded-full bg-primary'
            }
            style={indeterminate ? undefined : progressStyle}
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
              <DownloadIcon color="var(--color-brand)" size={14} /> {this.props.bytesConsumed}
            </span>
            <span className="inline-flex items-center gap-2">
              <CopyIcon color="var(--color-brand)" size={14} /> {this.props.messagesConsumed} messages
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

export function ZeroSizeWrapper(p: {
  width?: string;
  height?: string;
  justifyContent?: string;
  alignItems?: string;
  positionContentAbsolute?: boolean;
  transform?: string;
  children?: React.ReactNode;
}) {
  const zeroStyle: HelperStyleVars = {
    '--console-zero-width': p.width,
    '--console-zero-height': p.height,
    '--console-zero-justify': p.justifyContent,
    '--console-zero-align': p.alignItems,
    '--console-zero-transform': p.transform,
  };
  return (
    <span className="console-zero-size verticalCenter" style={zeroStyle}>
      <span className={p.positionContentAbsolute === true ? 'absolute' : undefined}>{p.children}</span>
    </span>
  );
}

export const DefaultSkeleton = (
  <motion.div {...animProps} className="m-8" key="defaultSkeleton">
    <SkeletonText lines={8} width="full" />
  </motion.div>
);

export const Ellipsis = (p: { children?: React.ReactNode; className?: string }) => (
  <span className={cn(p.className, 'max-w-full truncate align-text-bottom')}>{p.children}</span>
);

export const Code = (p: { children?: React.ReactNode; nowrap?: boolean }) => {
  const className = p.nowrap === true ? 'codeBox nowrap' : 'codeBox';
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
