/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { type Theme, useTheme } from 'components/redpanda-ui/components/theme-provider';
import { ToggleGroup, ToggleGroupItem } from 'components/redpanda-ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { Monitor, Moon, Sun } from 'lucide-react';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const;

const isTheme = (value: unknown): value is Theme => THEME_OPTIONS.some((option) => option.value === value);

/**
 * Standalone theme switcher on the Registry ThemeProvider, shown when dark mode is available: a
 * segmented System / Light / Dark control on the stored preference, so `System` stays selected and keeps
 * following the OS. Selecting the chosen segment again leaves it chosen.
 */
export const ThemeModeSwitch = () => {
  const { theme, setTheme } = useTheme();

  return (
    <TooltipProvider>
      <ToggleGroup
        aria-label="Theme"
        attached={false}
        onValueChange={([next]) => {
          if (isTheme(next)) {
            setTheme(next);
          }
        }}
        size="sm"
        testId="ColorModeSwitch"
        value={[theme]}
        variant="outline"
      >
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <Tooltip key={value}>
            <TooltipTrigger
              render={<ToggleGroupItem aria-label={label} value={value} />}
              testId={`ColorModeSwitch-${value}`}
            >
              <Icon aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </TooltipProvider>
  );
};
