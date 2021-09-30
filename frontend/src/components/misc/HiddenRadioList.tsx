import React from 'react';
import styles from './HiddenRadioList.module.scss';

export interface HiddenRadioOption<ValueType> {
  checked?: boolean;
  disabled?: boolean;
  value: ValueType;
  render: (option: HiddenRadioOption<ValueType>) => JSX.Element
}

export interface HiddenRadioListProps<ValueType> {
  options: Array<HiddenRadioOption<ValueType>>;
  name: string;
  onChange: (value: ValueType) => void;
  value?: ValueType;
  disabled?: boolean;
}

export function HiddenRadioList<ValueType>({options, name, onChange, value, ...rest}: HiddenRadioListProps<ValueType>) {
  const allDisabled = rest.disabled ?? false;

  return (<ul className={styles.radioCardGroup}>
    {options.map((option, i) => {
      const checked = (option.value === value || option.checked) ?? false;
      const disabled = (allDisabled || option.disabled) ?? false;
      return (
          <li key={i}>
            <label>
              <input
                  type="radio"
                  name={name}
                  onChange={() => onChange(option.value)}
                  checked={checked}
                  disabled={disabled}
              />
              {option.render({...option, checked, disabled})}
            </label>
          </li>
      );
    })}
  </ul>);
}
