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

//
// BandwidthSlider can work with two kinds of inputs
// 1) Simple 'controlled state'
//    You pass a 'value' and 'onChange' callback.
// 2) A settings object (that is supposed to be a mobx observable)
//    in which a 'maxReplicationTraffic' property exists.
//    The property will be directly read from / written to.
//
type ValueAndChangeCallback = { value: number | null; onChange: (x: number | null) => void };
type SettingsCallback = {
  settings: Pick<typeof uiSettings.reassignment, 'maxReplicationTraffic'>;
  onSettingsChange: (x: number | null) => void;
};

const SLIDER_MIN = 2;
const SLIDER_MAX = 12.1;

/** Marks are positioned by value, as Chakra's `SliderMark` did. */
const MARKS: { value: number; label: string }[] = [
  { value: 2, label: '-' },
  { value: 3, label: '1kB' },
  { value: 6, label: '1MB' },
  { value: 9, label: '1GB' },
  { value: 12, label: '1TB' },
];

const percentOf = (value: number) => ((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;

export function BandwidthSlider(props: ValueAndChangeCallback | SettingsCallback) {
  const [isDragging, setIsDragging] = useState(false);

  const getValue = (): number | null => {
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
  // `maxReplicationTraffic` defaults to 0, so log10 is -Infinity — which would make both the thumb
  // position and the bubble's `left: …%` invalid. Clamp once and use the clamped value everywhere.
  const sliderValue = Math.min(Math.max(Math.log10(value), SLIDER_MIN), SLIDER_MAX);

  const tipText = (f: number | null) => {
    if (f === null) {
      return null;
    }
    if (f < 3) {
      return 'No change';
    }
    if (f > 12) {
      return 'Unlimited';
    }
    const v = Math.round(10 ** f.clamp(3, 12));
    return `${prettyNumber(v).toUpperCase()}B/s`;
  };

  return (
    <div
      className="relative mx-4 mt-6 mb-4"
      // Pointer events, not mouse events: `onPointerEnter`/`Leave` are not flagged as
      // mouse-only interactions on a non-interactive element, and the bubble is decorative —
      // the Slider below is the control, and it is keyboard-operable on its own.
      onPointerEnter={() => {
        setIsDragging(true);
      }}
      onPointerLeave={() => {
        setIsDragging(false);
      }}
    >
      {/*
        The Registry Slider renders its own track and thumb and has no mark or thumb-tooltip slot,
        so the marks and the value bubble are positioned against the same value scale here. The
        bubble follows the thumb and appears on hover, as Chakra's `isOpen={isDragging}` tooltip did.
      */}
      {isDragging && tipText(sliderValue) ? (
        <div
          className="pointer-events-none absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-md bg-inverse px-2 py-1 text-body-sm text-inverse-foreground"
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
