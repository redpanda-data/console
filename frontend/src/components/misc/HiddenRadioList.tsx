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
    {options.map(option => {
      const checked = option.value === value || option.checked;
      const disabled = allDisabled || option.disabled;
      return (
          <li>
            <label>
              <input
                  type="radio"
                  value={String(option.value)}
                  name={name}
                  onInput={() => onChange(option.value)}
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
