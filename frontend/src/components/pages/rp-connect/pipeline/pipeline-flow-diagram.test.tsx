/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { fireEvent, render, screen } from 'test-utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PipelineFlowDiagram } from './pipeline-flow-diagram';

// ── Mocks ───────────────────────────────────────────────────────────

// ResizeObserver doesn't exist in jsdom
class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

let originalClientWidth: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  // Mock container dimensions so useLayoutEffect sets containerSize
  // and ReactFlow actually renders (it guards on containerSize !== null).
  originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (originalClientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  }
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  }
});

// ── Fixtures ────────────────────────────────────────────────────────

const KAFKA_INPUT_WITH_TOPIC = [
  'input:',
  '  kafka_franz:',
  '    seed_brokers:',
  '      - broker:9092',
  '    topics:',
  '      - my-topic',
].join('\n');

const REDPANDA_INPUT_MISSING_CONFIG = ['input:', '  redpanda:', '    seed_brokers:', '      - broker:9092'].join('\n');

const HTTP_OUTPUT = ['output:', '  http_client:', '    url: http://example.com'].join('\n');

const PROCESSOR_YAML = ['pipeline:', '  processors:', "    - mapping: 'root = this'"].join('\n');

const EMPTY_INPUT = ['input:', '  none: {}'].join('\n');

// ── Helpers ─────────────────────────────────────────────────────────

type DiagramCallbacks = {
  onAddConnector?: (type: string) => void;
  onAddTopic?: (section: string, componentName: string) => void;
  onAddSasl?: (section: string, componentName: string) => void;
};

function renderDiagram(yaml: string, callbacks: DiagramCallbacks = {}) {
  return render(
    <PipelineFlowDiagram
      configYaml={yaml}
      hideZoomControls
      onAddConnector={callbacks.onAddConnector}
      onAddSasl={callbacks.onAddSasl}
      onAddTopic={callbacks.onAddTopic}
    />
  );
}

// ── Tests ───────────────────────────────────────────────────────────

describe('PipelineFlowDiagram', () => {
  describe('empty and error states', () => {
    it('renders placeholder nodes for empty YAML', () => {
      renderDiagram('');
      // Empty YAML still produces placeholder sections via the parser
      expect(screen.getByText('Add input')).toBeInTheDocument();
      expect(screen.getByText('Add output')).toBeInTheDocument();
    });

    it('shows error banner for invalid YAML', () => {
      renderDiagram('{{{invalid');
      expect(screen.getByText('Unable to visualize pipeline.')).toBeInTheDocument();
    });
  });

  describe('section headers and connector names', () => {
    // Section labels from the parser are lowercase; CSS `uppercase` class handles display.
    it('renders input section header and connector name', () => {
      renderDiagram(KAFKA_INPUT_WITH_TOPIC);
      expect(screen.getByText('input')).toBeInTheDocument();
      expect(screen.getByText('kafka_franz')).toBeInTheDocument();
    });

    it('renders output section header and connector name', () => {
      renderDiagram(HTTP_OUTPUT);
      expect(screen.getByText('output')).toBeInTheDocument();
      expect(screen.getByText('http_client')).toBeInTheDocument();
    });

    it('renders processor section header and processor name', () => {
      renderDiagram(PROCESSOR_YAML);
      expect(screen.getByText('processors')).toBeInTheDocument();
      expect(screen.getByText('mapping')).toBeInTheDocument();
    });
  });

  describe('placeholder nodes', () => {
    it('shows "Add input" text for empty input placeholder', () => {
      renderDiagram(EMPTY_INPUT);
      expect(screen.getByText('Add input')).toBeInTheDocument();
    });

    it('fires onAddConnector when placeholder add button is clicked', () => {
      const onAddConnector = vi.fn();
      const { container } = renderDiagram(EMPTY_INPUT, { onAddConnector });

      // Find the absolute-positioned "+" button on the placeholder node via DOM query
      const plusButtons = container.querySelectorAll<HTMLButtonElement>('button[class*="absolute"]');
      expect(plusButtons.length).toBeGreaterThan(0);
      fireEvent.click(plusButtons[0]);
      expect(onAddConnector).toHaveBeenCalledWith('input');
    });

    it('does not show add button when onAddConnector is not provided', () => {
      const { container } = renderDiagram(EMPTY_INPUT);
      const plusButtons = container.querySelectorAll('button[class*="absolute"]');
      expect(plusButtons).toHaveLength(0);
    });
  });

  describe('topic badges', () => {
    it('renders topic badge for connectors with topics', () => {
      renderDiagram(KAFKA_INPUT_WITH_TOPIC);
      expect(screen.getByText('topic: my-topic')).toBeInTheDocument();
    });
  });

  describe('setup hint buttons', () => {
    it('shows "Topic" button on Redpanda node missing topic config', () => {
      renderDiagram(REDPANDA_INPUT_MISSING_CONFIG, { onAddTopic: vi.fn() });
      expect(screen.getByText('Topic')).toBeInTheDocument();
    });

    it('fires onAddTopic when "Topic" button is clicked', () => {
      const onAddTopic = vi.fn();
      renderDiagram(REDPANDA_INPUT_MISSING_CONFIG, { onAddTopic });

      const topicButton = screen.getByText('Topic').closest('button');
      expect(topicButton).not.toBeNull();
      fireEvent.click(topicButton as HTMLButtonElement);
      expect(onAddTopic).toHaveBeenCalledWith('input', 'redpanda');
    });

    it('shows "User" button on Redpanda node missing SASL config', () => {
      renderDiagram(REDPANDA_INPUT_MISSING_CONFIG, { onAddSasl: vi.fn() });
      expect(screen.getByText('User')).toBeInTheDocument();
    });

    it('fires onAddSasl when "User" button is clicked', () => {
      const onAddSasl = vi.fn();
      renderDiagram(REDPANDA_INPUT_MISSING_CONFIG, { onAddSasl });

      const userButton = screen.getByText('User').closest('button');
      expect(userButton).not.toBeNull();
      fireEvent.click(userButton as HTMLButtonElement);
      expect(onAddSasl).toHaveBeenCalledWith('input', 'redpanda');
    });

    it('hint buttons render but do nothing when callbacks are not provided', () => {
      // The parser sets missingTopic/missingSasl flags regardless of callbacks.
      // Buttons always render as visible hints; clicking them is a no-op without handlers.
      renderDiagram(REDPANDA_INPUT_MISSING_CONFIG);
      const topicButton = screen.getByText('Topic').closest('button');
      expect(topicButton).toBeInTheDocument();
      // Clicking should not throw (optional chaining in onClick)
      fireEvent.click(topicButton as HTMLButtonElement);
    });
  });

  describe('docs link', () => {
    it('renders a documentation link on connector leaf nodes', () => {
      renderDiagram(KAFKA_INPUT_WITH_TOPIC);
      const docsLink = screen.getByLabelText('kafka_franz documentation');
      expect(docsLink).toBeInTheDocument();
      expect(docsLink).toHaveAttribute(
        'href',
        'https://docs.redpanda.com/redpanda-cloud/develop/connect/components/inputs/kafka_franz/'
      );
      expect(docsLink).toHaveAttribute('target', '_blank');
    });
  });
});
