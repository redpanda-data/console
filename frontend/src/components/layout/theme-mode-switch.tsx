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

import { Button } from 'components/redpanda-ui/components/button';
import { useTheme } from 'components/redpanda-ui/components/theme-provider';
import { Moon, Sun } from 'lucide-react';

/** Dev-only theme toggle on the Registry ThemeProvider. `resolvedTheme`, not `theme`: the stored
 * preference can be `system`, and the label names the theme the click produces. */
export const ThemeModeSwitch = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';

  return (
    <Button
      aria-label={`Switch to ${next} mode`}
      data-testid="ColorModeSwitch"
      onClick={() => setTheme(next)}
      size="icon-sm"
      variant="ghost"
    >
      {resolvedTheme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
};
