import { Command, CommandGroup, CommandItem, CommandList } from 'components/redpanda-ui/components/command';
import { Input } from 'components/redpanda-ui/components/input';
import { type ChangeEvent, useEffect, useState } from 'react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  suggestions?: string[];
  'data-testid'?: string;
}

export function AutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
  suggestions = [],
  'data-testid': dataTestId,
}: AutocompleteInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);

    if (newValue.length > 0 && suggestions.length > 0) {
      const filtered = suggestions.filter((suggestion) => suggestion.toLowerCase().includes(newValue.toLowerCase()));
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setInputValue(suggestion);
    onChange(suggestion);
    setShowSuggestions(false);
  };

  return (
    <div className="relative flex-1">
      <Input
        className={className}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onChange={handleInputChange}
        onFocus={() => {
          if (inputValue.length > 0 && suggestions.length > 0) {
            const filtered = suggestions.filter((suggestion) =>
              suggestion.toLowerCase().includes(inputValue.toLowerCase()),
            );
            setFilteredSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
          }
        }}
        placeholder={placeholder}
        testId={dataTestId}
        type="text"
        value={inputValue}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1">
          <Command className="rounded-lg border shadow-md bg-white">
            <CommandList>
              <CommandGroup>
                {filteredSuggestions.map((suggestion) => (
                  <CommandItem
                    className="cursor-pointer"
                    key={suggestion}
                    onSelect={() => handleSelectSuggestion(suggestion)}
                  >
                    {suggestion}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}
