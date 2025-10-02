import type { ChangeEvent } from 'react';
import { vi } from 'vitest';

interface ChakraEvent {
  label: string;
  value: string;
}

interface MockedReactSelectProps {
  options: Array<ChakraEvent>;
  value: string;
  onChange: (event?: ChakraEvent) => void;
}

const MockedReactSelect = ({ options, value, onChange }: MockedReactSelectProps) => {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const matchingOption = options.find((option) => option.value === event.target.value);
    onChange(matchingOption);
  }
  return (
    <>
      <select data-testid="select" value={value} onChange={handleChange}>
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

vi.mock('react-select', () => ({
  default: MockedReactSelect,
}));
