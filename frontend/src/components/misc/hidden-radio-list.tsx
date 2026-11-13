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

import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import type { JSX } from 'react';

import styles from './HiddenRadioList.module.scss';

export type HiddenRadioOption<ValueType> = {
  checked?: boolean;
  disabled?: boolean;
  value: ValueType;
  render: (option: HiddenRadioOption<ValueType>) => JSX.Element;
};

export type HiddenRadioListProps<ValueType> = {
  options: HiddenRadioOption<ValueType>[];
  name: string;
  onChange: (value: ValueType) => void;
  value?: ValueType;
  disabled?: boolean;
};

export function HiddenRadioList<ValueType>({
  options,
  name,
  onChange,
  value,
  ...rest
}: HiddenRadioListProps<ValueType>) {
  const allDisabled = rest.disabled ?? false;

  const selected = options.findIndex((option) => option.value === value || option.checked);
  return (
    <RadioGroup
      aria-label={name}
      className={styles.radioCardGroup}
      disabled={allDisabled}
      name={name}
      onValueChange={(next) => {
        const option = options[Number(next)];
        if (next !== null && option) {
          onChange(option.value);
        }
      }}
      value={selected < 0 ? null : String(selected)}
    >
      {options.map((option, index) => (
        <Radio
          disabled={option.disabled}
          key={String(index)}
          render={
            <div className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          }
          value={String(index)}
        >
          {option.render({ ...option, checked: index === selected, disabled: allDisabled || option.disabled })}
        </Radio>
      ))}
    </RadioGroup>
  );
}
