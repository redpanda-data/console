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

import userEvent from '@testing-library/user-event';
import { render, screen } from 'test-utils';
import { describe, expect, test } from 'vitest';

import { ToolEventCard } from './tool-event-card';

const smallPayload = JSON.stringify({ key: 'value' }, null, 2);
const largePayload = JSON.stringify(
  {
    data: Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      description: `This is a description for item ${i} with some additional text to make it longer`,
    })),
  },
  null,
  2
);

describe('ToolEventCard', () => {
  describe('rendering', () => {
    test('renders tool name in header', () => {
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      expect(screen.getByText('readFile')).toBeVisible();
    });

    test('renders type label for tool calls', () => {
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      expect(screen.getByText('Tool Call')).toBeVisible();
    });

    test('renders type label for tool responses', () => {
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="response" />);

      expect(screen.getByText('Tool Response')).toBeVisible();
    });

    test('renders truncated call ID when provided', () => {
      render(
        <ToolEventCard
          callId="abc12345xyz67890"
          content={smallPayload}
          testId="tool-card"
          toolName="readFile"
          type="call"
        />
      );

      expect(screen.getByText('abc12345')).toBeVisible();
    });

    test('renders payload size', () => {
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      // Small payload should show bytes
      expect(screen.getByText(/\d+\s*B/)).toBeVisible();
    });
  });

  describe('auto-expand behavior', () => {
    test('auto-expands small payloads (< 2KB)', () => {
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      // Content should be visible for small payloads
      expect(screen.getByText(/key/)).toBeVisible();
      expect(screen.getByText(/value/)).toBeVisible();
    });

    test('collapses large payloads by default', async () => {
      render(<ToolEventCard content={largePayload} testId="tool-card" toolName="readFile" type="call" />);

      // Should show preview instead of full content
      const preview = screen.getByTestId('tool-card-preview');
      expect(preview).toBeVisible();
    });

    test('respects defaultExpanded override', () => {
      render(
        <ToolEventCard content={largePayload} defaultExpanded testId="tool-card" toolName="readFile" type="call" />
      );

      // Should be expanded despite large size
      const toggle = screen.getByTestId('tool-card-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('expand/collapse interaction', () => {
    test('toggles expansion when header is clicked', async () => {
      const user = userEvent.setup();
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      const toggle = screen.getByTestId('tool-card-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    test('expands when preview is clicked', async () => {
      const user = userEvent.setup();
      render(<ToolEventCard content={largePayload} testId="tool-card" toolName="readFile" type="call" />);

      const preview = screen.getByTestId('tool-card-preview');
      await user.click(preview);

      const toggle = screen.getByTestId('tool-card-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('ARIA accessibility', () => {
    test('has aria-controls linking to content', () => {
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      const toggle = screen.getByTestId('tool-card-toggle');
      const contentId = toggle.getAttribute('aria-controls');

      expect(contentId).toBeTruthy();
      expect(document.getElementById(contentId!)).toBeInTheDocument();
    });

    test('has aria-expanded reflecting state', async () => {
      const user = userEvent.setup();
      render(<ToolEventCard content={smallPayload} testId="tool-card" toolName="readFile" type="call" />);

      const toggle = screen.getByTestId('tool-card-toggle');
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    test('has aria-label on preview button', () => {
      render(<ToolEventCard content={largePayload} testId="tool-card" toolName="readFile" type="call" />);

      const preview = screen.getByTestId('tool-card-preview');
      expect(preview).toHaveAttribute('aria-label', 'Expand readFile tool call');
    });
  });

  describe('response visual indicator', () => {
    test('shows CornerDownRight icon for responses with callId', () => {
      const { container } = render(
        <ToolEventCard
          callId="abc12345xyz67890"
          content={smallPayload}
          testId="tool-card"
          toolName="readFile"
          type="response"
        />
      );

      // The CornerDownRight icon should be present (SVG with specific class)
      const svg = container.querySelector('.lucide-corner-down-right');
      expect(svg).toBeInTheDocument();
    });

    test('does not show CornerDownRight icon for calls', () => {
      const { container } = render(
        <ToolEventCard
          callId="abc12345xyz67890"
          content={smallPayload}
          testId="tool-card"
          toolName="readFile"
          type="call"
        />
      );

      const svg = container.querySelector('.lucide-corner-down-right');
      expect(svg).not.toBeInTheDocument();
    });
  });
});
