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

  return (
    <ul className={styles.radioCardGroup}>
      {options.map((option, i) => {
        const checked = (option.value === value || option.checked) ?? false;
        const disabled = (allDisabled || option.disabled) ?? false;
        return (
          <li key={i}>
            <label>
              <input
                checked={checked}
                disabled={disabled}
                name={name}
                onChange={() => onChange(option.value)}
                type="radio"
              />
              {option.render({ ...option, checked, disabled })}
            </label>
          </li>
        );
      })}
    </ul>
  );
}
