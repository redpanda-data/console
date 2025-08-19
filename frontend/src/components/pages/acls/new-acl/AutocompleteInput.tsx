import * as React from 'react';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/redpanda-ui/command';
import { Input } from '@/components/redpanda-ui/input';

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
  const [inputValue, setInputValue] = React.useState(value);
  const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        data-testid={dataTestId}
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onFocus={() => {
          if (inputValue.length > 0 && suggestions.length > 0) {
            const filtered = suggestions.filter((suggestion) =>
              suggestion.toLowerCase().includes(inputValue.toLowerCase()),
            );
            setFilteredSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
          }
        }}
        className={className}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1">
          <Command className="rounded-lg border shadow-md bg-white">
            <CommandList>
              <CommandGroup>
                {filteredSuggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion}
                    onSelect={() => handleSelectSuggestion(suggestion)}
                    className="cursor-pointer"
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
