import { Command, CommandGroup, CommandItem, CommandList } from 'components/redpanda-ui/components/command';
import { Input } from 'components/redpanda-ui/components/input';
import { type ChangeEvent, useState } from 'react';

const EMPTY_SUGGESTIONS: string[] = [];

type AutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  suggestions?: string[];
  'data-testid'?: string;
};

export function AutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
  suggestions = EMPTY_SUGGESTIONS,
  'data-testid': dataTestId,
}: AutocompleteInputProps) {
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
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
          if (value.length > 0 && suggestions.length > 0) {
            const filtered = suggestions.filter((suggestion) => suggestion.toLowerCase().includes(value.toLowerCase()));
            setFilteredSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
          }
        }}
        placeholder={placeholder}
        testId={dataTestId}
        type="text"
        value={value}
      />

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1">
          <Command className="rounded-lg border bg-white shadow-md">
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
