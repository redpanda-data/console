import type { ChangeEvent } from 'react';
import { vi } from 'vitest';

type ChakraEvent = {
  label: string;
  value: string;
};

type MockedReactSelectProps = {
  options: ChakraEvent[];
  value: string;
  onChange: (event?: ChakraEvent) => void;
};

const MockedReactSelect = ({ options, value, onChange }: MockedReactSelectProps) => {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const matchingOption = options.find((option) => option.value === event.target.value);
    onChange(matchingOption);
  }
  return (
    <>
      <select data-testid="select" onChange={handleChange} value={value}>
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
