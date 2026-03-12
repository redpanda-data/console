/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { cn } from 'components/redpanda-ui/lib/utils';
import { type FC, useId } from 'react';

type ChartSkeletonVariant = 'line' | 'area' | 'bar';

type ChartSkeletonProps = {
  variant?: ChartSkeletonVariant;
  className?: string;
};

const GRID_LINES = 4;
const VIEWBOX_W = 200;
const VIEWBOX_H = 80;
const PADDING = { top: 8, right: 8, bottom: 16, left: 24 };
const CHART_W = VIEWBOX_W - PADDING.left - PADDING.right;
const CHART_H = VIEWBOX_H - PADDING.top - PADDING.bottom;

const LINE_PATH_1 = `M0,${CHART_H * 0.6} C${CHART_W * 0.15},${CHART_H * 0.5} ${CHART_W * 0.25},${CHART_H * 0.35} ${CHART_W * 0.35},${CHART_H * 0.4} C${CHART_W * 0.45},${CHART_H * 0.45} ${CHART_W * 0.55},${CHART_H * 0.2} ${CHART_W * 0.65},${CHART_H * 0.25} C${CHART_W * 0.75},${CHART_H * 0.3} ${CHART_W * 0.85},${CHART_H * 0.15} ${CHART_W},${CHART_H * 0.3}`;
const LINE_PATH_2 = `M0,${CHART_H * 0.75} C${CHART_W * 0.15},${CHART_H * 0.65} ${CHART_W * 0.25},${CHART_H * 0.55} ${CHART_W * 0.35},${CHART_H * 0.6} C${CHART_W * 0.45},${CHART_H * 0.65} ${CHART_W * 0.55},${CHART_H * 0.4} ${CHART_W * 0.65},${CHART_H * 0.45} C${CHART_W * 0.75},${CHART_H * 0.5} ${CHART_W * 0.85},${CHART_H * 0.35} ${CHART_W},${CHART_H * 0.5}`;

const AREA_CLOSE = `L${CHART_W},${CHART_H} L0,${CHART_H} Z`;

const BAR_COUNT = 8;
const BAR_GAP = 2;
const BAR_W = (CHART_W - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
const BAR_HEIGHTS_1 = [0.5, 0.6, 0.4, 0.7, 0.55, 0.75, 0.45, 0.65];
const BAR_HEIGHTS_2 = [0.35, 0.45, 0.3, 0.5, 0.4, 0.55, 0.3, 0.48];

function GridLines() {
  return (
    <>
      {Array.from({ length: GRID_LINES }, (_, i) => {
        const y = (CHART_H / (GRID_LINES - 1)) * i;
        return <line key={i} stroke="currentColor" strokeOpacity={0.08} x1={0} x2={CHART_W} y1={y} y2={y} />;
      })}
    </>
  );
}

function AxisTicks() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => {
        const x = (CHART_W / 4) * i;
        return (
          <rect fill="currentColor" height={2} key={`x-${i}`} opacity={0.1} rx={1} width={12} x={x} y={CHART_H + 6} />
        );
      })}
      {Array.from({ length: GRID_LINES }, (_, i) => {
        const y = (CHART_H / (GRID_LINES - 1)) * i;
        return (
          <rect fill="currentColor" height={2} key={`y-${i}`} opacity={0.1} rx={1} width={10} x={-18} y={y - 1} />
        );
      })}
    </>
  );
}

function LineVariant() {
  return (
    <>
      <path
        d={LINE_PATH_1}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity={0.12}
        strokeWidth={1.5}
      />
      <path
        d={LINE_PATH_2}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity={0.08}
        strokeWidth={1.5}
      />
    </>
  );
}

function AreaVariant() {
  const id = useId();
  return (
    <>
      <defs>
        <linearGradient id={`${id}-fill1`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.08} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.01} />
        </linearGradient>
        <linearGradient id={`${id}-fill2`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.05} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0.01} />
        </linearGradient>
      </defs>
      <path d={`${LINE_PATH_1} ${AREA_CLOSE}`} fill={`url(#${id}-fill1)`} />
      <path
        d={LINE_PATH_1}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity={0.12}
        strokeWidth={1.5}
      />
      <path d={`${LINE_PATH_2} ${AREA_CLOSE}`} fill={`url(#${id}-fill2)`} />
      <path
        d={LINE_PATH_2}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity={0.08}
        strokeWidth={1.5}
      />
    </>
  );
}

function BarVariant() {
  return (
    <>
      {BAR_HEIGHTS_1.map((h, i) => {
        const x = i * (BAR_W + BAR_GAP);
        const barH = CHART_H * h;
        return (
          <rect
            fill="currentColor"
            height={barH}
            key={`b1-${i}`}
            opacity={0.08}
            rx={1}
            width={BAR_W * 0.45}
            x={x}
            y={CHART_H - barH}
          />
        );
      })}
      {BAR_HEIGHTS_2.map((h, i) => {
        const x = i * (BAR_W + BAR_GAP) + BAR_W * 0.5;
        const barH = CHART_H * h;
        return (
          <rect
            fill="currentColor"
            height={barH}
            key={`b2-${i}`}
            opacity={0.05}
            rx={1}
            width={BAR_W * 0.45}
            x={x}
            y={CHART_H - barH}
          />
        );
      })}
    </>
  );
}

const VARIANT_MAP: Record<ChartSkeletonVariant, FC> = {
  line: LineVariant,
  area: AreaVariant,
  bar: BarVariant,
};

export const ChartSkeleton: FC<ChartSkeletonProps> = ({ variant = 'area', className }) => {
  const VariantComponent = VARIANT_MAP[variant];
  return (
    <div className={cn('animate-pulse', className)}>
      <svg className="block h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}>
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          <GridLines />
          <AxisTicks />
          <VariantComponent />
        </g>
      </svg>
    </div>
  );
};
