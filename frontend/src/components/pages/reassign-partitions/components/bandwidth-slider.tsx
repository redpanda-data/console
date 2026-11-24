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

import { useState } from 'react';

import type { uiSettings } from '../../../../state/ui';
import { prettyNumber } from '../../../../utils/utils';
import '../../../../utils/number-extensions';
import { Slider } from 'components/redpanda-ui/components/slider';

type ValueAndChangeCallback = { value: number | null; onChange: (x: number | null) => void };
type SettingsCallback = {
  settings: Pick<typeof uiSettings.reassignment, 'maxReplicationTraffic'>;
  onSettingsChange: (x: number | null) => void;
};

const SLIDER_MIN = 2;
const SLIDER_MAX = 12;

const MARKS: { value: number; label: string }[] = [
  { value: 2, label: '-' },
  { value: 3, label: '1kB' },
  { value: 6, label: '1MB' },
  { value: 9, label: '1GB' },
  { value: 12, label: '1TB' },
];

const percentOf = (value: number) => ((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

/**
 * Positions marks and the drag-only value bubble on the same scale as the registry thumb.
 */
export function BandwidthSlider(props: ValueAndChangeCallback | SettingsCallback) {
  const [isDragging, setIsDragging] = useState(false);

  const getValue = () => {
    if ('value' in props) {
      return props.value;
    }
    return props.settings.maxReplicationTraffic;
  };

  const setValue = (x: number | null) => {
    if ('value' in props) {
      props.onChange(x);
    } else {
      props.onSettingsChange(x);
    }
  };

  const value = getValue() ?? 0;
  const sliderValue = Math.min(Math.max(Math.log10(value), SLIDER_MIN), SLIDER_MAX);

  const tipText = (f: number | null) => {
    if (f === null) {
      return null;
    }
    if (f < 3) {
      return 'No change';
    }
    const v = Math.round(10 ** f.clamp(3, 12));
    return `${prettyNumber(v).toUpperCase()}B/s`;
  };

  return (
    <div
      className="relative mx-4 mt-6 mb-4"
      onPointerEnter={() => {
        setIsDragging(true);
      }}
      onPointerLeave={() => {
        setIsDragging(false);
      }}
    >
      {isDragging && tipText(sliderValue) ? (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-primary px-2 py-1 text-body-sm whitespace-nowrap text-primary-foreground shadow-md"
          style={{ left: `${percentOf(sliderValue)}%` }}
        >
          {tipText(sliderValue)}
        </div>
      ) : null}

      <Slider
        max={SLIDER_MAX}
        min={SLIDER_MIN}
        onValueChange={([n]) => {
          if (n < 2.5) {
            setValue(null);
          } else {
            setValue(Math.round(10 ** n.clamp(3, 12)));
          }
        }}
        step={0.1}
        value={[sliderValue]}
      />

      <div className="relative mt-1 mb-2 h-5">
        {MARKS.map((mark) => (
          <span
            className="absolute -translate-x-1/2 text-body-sm text-subtle"
            key={mark.value}
            style={{ left: `${percentOf(mark.value)}%` }}
          >
            {mark.label}
          </span>
        ))}
      </div>
    </div>
  );
}
