// Copyright 2026 Redpanda Data, Inc.

'use client';

import React from 'react';
import {
  type DefaultLegendContentProps,
  type DefaultTooltipContentProps,
  Legend,
  ResponsiveContainer,
  Tooltip,
  type TooltipValueType,
} from 'recharts';
import { hasSlotContent } from '../lib/has-slot-content';
import { cn, type SharedProps } from '../lib/utils';

const INITIAL_DIMENSION = { width: 320, height: 200 } as const;

type TooltipNameType = number | string;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  };
};

interface ChartContextProps {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (context === null) {
    throw new Error('useChart must be used within a <ChartContainer />');
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  testId,
  ...props
}: React.ComponentProps<'div'> &
  SharedProps & {
    config: ChartConfig;
    children: React.ComponentProps<typeof ResponsiveContainer>['children'];
    initialDimension?:
      | {
          width: number;
          height: number;
        }
      | undefined;
  }) {
  const uniqueId = React.useId();
  const chartId = `chart-${id !== undefined && id !== '' ? id : uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn(
          "flex aspect-video justify-center text-body-sm [&_.recharts-cartesian-axis-tick_text]:fill-subtle [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border-subtle [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-surface-subtle [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-surface-subtle [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        data-chart={chartId}
        data-slot="chart"
        data-testid={testId}
        id={id}
        {...props}
      >
        <ResponsiveContainer initialDimension={initialDimension}>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function getUniquePayloadKey(configKey: string, occurrences: Map<string, number>): string {
  const occurrence = occurrences.get(configKey) ?? 0;
  occurrences.set(configKey, occurrence + 1);
  return `${configKey}-${occurrence}`;
}

const ChartTooltip = Tooltip;

function ChartTooltipValue({ value }: { value: TooltipValueType | null | undefined }) {
  if (value === undefined || value === null) {
    return null;
  }
  let text: string;
  if (typeof value === 'number') {
    text = value.toLocaleString();
  } else if (typeof value === 'string') {
    text = value;
  } else {
    text = value.join(',');
  }
  return <span className="font-mono font-medium text-foreground tabular-nums">{text}</span>;
}

function ChartTooltipIndicator({
  icon: Icon,
  hidden,
  indicator,
  nested,
  color,
}: {
  icon: React.ComponentType | undefined;
  hidden: boolean;
  indicator: 'line' | 'dot' | 'dashed';
  nested: boolean;
  color: string | undefined;
}) {
  if (Icon !== undefined) {
    return <Icon />;
  }
  if (hidden) {
    return null;
  }
  const style: React.CSSProperties & Record<'--color-bg' | '--color-border', string | undefined> = {
    '--color-bg': color,
    '--color-border': color,
  };
  return (
    <div
      className={cn('shrink-0 rounded-xs border-(--color-border) bg-(--color-bg)', {
        'size-2.5': indicator === 'dot',
        'w-1': indicator === 'line',
        'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
        'my-0.5': nested && indicator === 'dashed',
      })}
      style={style}
    />
  );
}

type ChartTooltipContentProps = React.ComponentProps<typeof Tooltip> &
  React.ComponentProps<'div'> & {
    hideLabel?: boolean | undefined;
    hideIndicator?: boolean | undefined;
    indicator?: 'line' | 'dot' | 'dashed' | undefined;
    nameKey?: string | undefined;
    labelKey?: string | undefined;
  } & Omit<DefaultTooltipContentProps<TooltipValueType, TooltipNameType>, 'accessibilityLayer'>;

function ChartTooltipLabel({
  hideLabel,
  payload,
  labelKey,
  label,
  labelFormatter,
  labelClassName,
}: {
  hideLabel: boolean;
  payload: NonNullable<ChartTooltipContentProps['payload']>;
  labelKey: string | undefined;
  label: React.ReactNode;
  labelFormatter: ChartTooltipContentProps['labelFormatter'];
  labelClassName: string | undefined;
}) {
  const { config } = useChart();
  if (hideLabel || payload.length === 0) {
    return null;
  }

  const [item] = payload;
  const key = seriesKey(labelKey, item?.dataKey, item?.name);
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const value =
    !(labelKey !== undefined && labelKey !== '') && typeof label === 'string'
      ? [config[label]?.label, label].find(hasSlotContent)
      : itemConfig?.label;

  if (labelFormatter !== undefined) {
    return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>;
  }

  if (!hasSlotContent(value)) {
    return null;
  }

  return <div className={cn('font-medium', labelClassName)}>{value}</div>;
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!(active === true && payload !== undefined && payload.length > 0)) {
    return null;
  }

  const tooltipLabel = (
    <ChartTooltipLabel
      hideLabel={hideLabel}
      label={label}
      labelClassName={labelClassName}
      labelFormatter={labelFormatter}
      labelKey={labelKey}
      payload={payload}
    />
  );

  const nestLabel = payload.length === 1 && indicator !== 'dot';
  const keyOccurrences = new Map<string, number>();

  return (
    <div
      className={cn(
        'grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border-subtle bg-background px-2.5 py-1.5 text-body-sm shadow-xl',
        className
      )}
    >
      {!nestLabel && tooltipLabel}
      <div className="grid gap-1.5">
        {payload.reduce<React.ReactNode[]>((rows, item, index) => {
          if (item.type === 'none') {
            return rows;
          }
          const configKey = seriesKey(nameKey, item.name, item.dataKey);
          const itemConfig = getPayloadConfigFromPayload(config, item, configKey);
          const indicatorColor = [color, stringProperty(item.payload, 'fill'), item.color, itemConfig?.color].find(
            (candidate) => candidate !== undefined && candidate !== ''
          );

          rows.push(
            <div
              className={cn(
                'flex w-full flex-wrap items-stretch gap-2 [&>svg]:size-2.5 [&>svg]:text-subtle',
                indicator === 'dot' && 'items-center'
              )}
              key={getUniquePayloadKey(configKey, keyOccurrences)}
            >
              {formatter !== undefined && item.value !== undefined && item.name !== undefined ? (
                formatter(item.value, item.name, item, index, payload)
              ) : (
                <>
                  <ChartTooltipIndicator
                    color={indicatorColor}
                    hidden={hideIndicator}
                    icon={itemConfig?.icon}
                    indicator={indicator}
                    nested={nestLabel}
                  />
                  <div
                    className={cn('flex flex-1 justify-between leading-none', nestLabel ? 'items-end' : 'items-center')}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? tooltipLabel : null}
                      <span className="text-subtle">{[itemConfig?.label, item.name].find(hasSlotContent)}</span>
                    </div>
                    <ChartTooltipValue value={item.value} />
                  </div>
                </>
              )}
            </div>
          );
          return rows;
        }, [])}
      </div>
    </div>
  );
}

const ChartLegend = Legend;

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  position = 'bottom',
  nameKey,
}: React.ComponentProps<'div'> & {
  hideIcon?: boolean | undefined;
  nameKey?: string | undefined;
} & Omit<DefaultLegendContentProps, 'align' | 'verticalAlign'> &
  Pick<React.ComponentProps<typeof Legend>, 'position'>) {
  const { config } = useChart();

  if (!(payload !== undefined && payload.length > 0)) {
    return null;
  }

  const keyOccurrences = new Map<string, number>();

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4',
        typeof position === 'string' && position.toLowerCase().includes('top') ? 'pb-3' : 'pt-3',
        className
      )}
    >
      {payload.flatMap((item) => {
        if (item.type === 'none') {
          return [];
        }
        const key = seriesKey(nameKey, item.dataKey);
        const itemConfig = getPayloadConfigFromPayload(config, item, key);
        const swatchColor = [item.color, itemConfig?.color].find(
          (candidate) => candidate !== undefined && candidate !== ''
        );
        const swatchStyle: React.CSSProperties & { '--chart-legend-color': string | undefined } = {
          '--chart-legend-color': swatchColor,
        };
        return [
          <div
            className={cn('flex items-center gap-1.5 [&>svg]:size-3 [&>svg]:text-subtle')}
            key={getUniquePayloadKey(key, keyOccurrences)}
          >
            {itemConfig?.icon !== undefined && !hideIcon ? (
              <itemConfig.icon />
            ) : (
              <div className="size-2 shrink-0 rounded-xs bg-(--chart-legend-color)" style={swatchStyle} />
            )}
            {itemConfig?.label}
          </div>,
        ];
      })}
    </div>
  );
}

function seriesKey(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'number' || (typeof value === 'string' && value !== '')) {
      return String(value);
    }
  }
  return 'value';
}

function stringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) {
    return;
  }
  const property: unknown = Reflect.get(value, key);
  return typeof property === 'string' ? property : undefined;
}

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== 'object' || payload === null) {
    return;
  }
  const nestedPayload: unknown = 'payload' in payload ? payload.payload : undefined;
  const configLabelKey = stringProperty(payload, key) ?? stringProperty(nestedPayload, key) ?? key;
  return config[configLabelKey] ?? config[key];
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent };
