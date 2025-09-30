import type { ChangeEvent } from 'react';
import * as React from 'react';
import { mock } from 'bun:test';

interface ChakraEvent {
  label: string;
  value: string;
}

interface MockedReactSelectProps {
  options: Array<ChakraEvent>;
  value?: string | ChakraEvent | ChakraEvent[];
  defaultValue?: ChakraEvent | ChakraEvent[];
  onChange: (event?: ChakraEvent | ChakraEvent[]) => void;
  isMulti?: boolean;
  placeholder?: string;
  onBlur?: () => void;
}

const MockedReactSelect = ({
  options,
  value,
  defaultValue,
  onChange,
  isMulti,
  placeholder,
  onBlur
}: MockedReactSelectProps): React.JSX.Element => {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    if (isMulti) {
      // For multi-select, handle both native multi-select and our test simulation
      let selectedValues: string[] = [];

      if (event.target.selectedOptions && event.target.selectedOptions.length > 0) {
        // Native multi-select
        selectedValues = Array.from(event.target.selectedOptions).map(option => option.value);
      } else if (Array.isArray(event.target.value)) {
        // Test simulation with array
        selectedValues = event.target.value;
      } else {
        // Single value in multi-select context
        selectedValues = [event.target.value];
      }

      const selectedOptions = selectedValues
        .map(value => options.find(opt => opt.value === value))
        .filter(Boolean) as ChakraEvent[];
      onChange(selectedOptions);
    } else {
      const matchingOption = options.find((option) => option.value === event.target.value);
      onChange(matchingOption);
    }
  }

  // Extract current values for the select element
  let currentValue: string | string[] = '';
  if (value) {
    if (Array.isArray(value)) {
      currentValue = value.map(v => typeof v === 'string' ? v : v.value);
    } else if (typeof value === 'object') {
      currentValue = value.value;
    } else {
      currentValue = value;
    }
  } else if (defaultValue) {
    if (Array.isArray(defaultValue)) {
      currentValue = defaultValue.map(v => v.value);
    } else {
      currentValue = defaultValue.value;
    }
  }

  return (
    <>
      <select
        data-testid="select"
        value={currentValue}
        onChange={handleChange}
        onBlur={onBlur}
        multiple={isMulti}
        role={isMulti ? 'listbox' : 'combobox'}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option: ChakraEvent) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div>select is required</div>
    </>
  );
};

// Mock just react-select
mock.module('react-select', () => ({
  default: MockedReactSelect,
}));

// Mock only the Select component from @redpanda-data/ui
mock.module('@redpanda-data/ui', () => {
  const originalModule = require('@redpanda-data/ui');
  return {
    ...originalModule,
    Select: MockedReactSelect,
  };
});
