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

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Functional ref mocks (must be before component import) ----

const mockTopicSubmit = vi.fn().mockResolvedValue({
  success: true,
  data: { topicName: 'test-topic' },
});
const mockUserSubmit = vi.fn().mockResolvedValue({
  success: true,
  data: { username: 'test-user', saslMechanism: 'SCRAM-SHA-256', consumerGroup: 'test-group' },
});

// Mock the AddConnectorDialog to expose onAddConnector via testable buttons
vi.mock('../onboarding/add-connector-dialog', () => ({
  AddConnectorDialog: (props: {
    isOpen: boolean;
    onAddConnector?: (name: string, type: string) => void;
    onCloseAddConnector: () => void;
  }) =>
    props.isOpen ? (
      <div data-testid="add-connector-dialog">
        <button
          data-testid="select-connector"
          onClick={() => props.onAddConnector?.('test-connector', 'input')}
          type="button"
        >
          Select
        </button>
        <button data-testid="select-redpanda" onClick={() => props.onAddConnector?.('redpanda', 'input')} type="button">
          Redpanda
        </button>
      </div>
    ) : null,
}));

// Mock AddTopicStep with functional ref exposing triggerSubmit
vi.mock('../onboarding/add-topic-step', async () => {
  const React = await import('react');
  return {
    AddTopicStep: React.forwardRef((_props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        triggerSubmit: mockTopicSubmit,
        isPending: false,
      }));
      return <div data-testid="add-topic-step" />;
    }),
  };
});

// Mock AddUserStep with functional ref exposing triggerSubmit
vi.mock('../onboarding/add-user-step', async () => {
  const React = await import('react');
  return {
    AddUserStep: React.forwardRef((_props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        triggerSubmit: mockUserSubmit,
        isPending: false,
      }));
      return <div data-testid="add-user-step" />;
    }),
  };
});

// Mock yaml helpers
vi.mock('../utils/yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/yaml')>();
  return {
    ...actual,
    getConnectTemplate: vi.fn(() => 'generated:\n  yaml: {}'),
    applyRedpandaSetup: vi.fn(() => 'patched:\n  yaml: {}'),
  };
});

import { create } from '@bufbuild/protobuf';
// Import component and dependencies AFTER mocks
import { ComponentListSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { fireEvent, render, screen, waitFor } from 'test-utils';

import { ConnectorWizard } from './connector-wizard';
import { applyRedpandaSetup, getConnectTemplate } from '../utils/yaml';

// Minimal ComponentList needed as prop
const emptyComponentList = create(ComponentListSchema, { components: [] });

function renderWizard(overrides: Partial<Parameters<typeof ConnectorWizard>[0]> = {}) {
  const defaults = {
    addConnectorType: 'input' as const,
    onClose: vi.fn(),
    components: [],
    componentList: emptyComponentList,
    yamlContent: '',
    onYamlChange: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  const result = render(<ConnectorWizard {...props} />);
  return { ...result, props };
}

describe('ConnectorWizard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getConnectTemplate).mockReturnValue('generated:\n  yaml: {}');
    vi.mocked(applyRedpandaSetup).mockReturnValue('patched:\n  yaml: {}');
    mockTopicSubmit.mockResolvedValue({
      success: true,
      data: { topicName: 'test-topic' },
    });
    mockUserSubmit.mockResolvedValue({
      success: true,
      data: { username: 'test-user', saslMechanism: 'SCRAM-SHA-256', consumerGroup: 'test-group' },
    });
  });

  describe('adding a non-Redpanda connector', () => {
    it('generates a YAML template and inserts it into the editor', () => {
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-connector'));

      expect(getConnectTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionName: 'test-connector',
          connectionType: 'input',
        })
      );
      expect(props.onYamlChange).toHaveBeenCalledWith('generated:\n  yaml: {}');
    });

    it('closes the connector picker before inserting YAML', () => {
      const callOrder: string[] = [];
      const onClose = vi.fn(() => callOrder.push('onClose'));
      const onYamlChange = vi.fn(() => callOrder.push('onYamlChange'));

      renderWizard({ onClose, onYamlChange });

      fireEvent.click(screen.getByTestId('select-connector'));

      expect(callOrder).toEqual(['onClose', 'onYamlChange']);
    });

    it('does not insert YAML when no template is available for the connector', () => {
      vi.mocked(getConnectTemplate).mockReturnValue(null as unknown as string);

      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-connector'));

      expect(getConnectTemplate).toHaveBeenCalled();
      expect(props.onYamlChange).not.toHaveBeenCalled();
    });
  });

  describe('adding a Redpanda connector with topic and user', () => {
    it('opens a setup wizard to configure topic and user', () => {
      renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      expect(screen.getByText('Configure redpanda input')).toBeInTheDocument();
    });

    it('submits the topic step and advances to user configuration', async () => {
      renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => {
        expect(mockTopicSubmit).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByTestId('add-user-step')).toBeInTheDocument();
      });
    });

    it('completing both steps calls applyRedpandaSetup and onYamlChange', async () => {
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      // Complete topic step
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      // Complete user step
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => {
        expect(applyRedpandaSetup).toHaveBeenCalledWith(
          expect.objectContaining({
            connectionName: 'redpanda',
            connectionType: 'input',
            result: expect.objectContaining({
              topicName: 'test-topic',
              authMethod: 'sasl',
              username: 'test-user',
            }),
          })
        );
      });

      expect(props.onYamlChange).toHaveBeenCalledWith('patched:\n  yaml: {}');
    });

    it('closes the Redpanda dialog after completing setup', async () => {
      renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));
      expect(screen.getByText('Configure redpanda input')).toBeInTheDocument();

      // Complete topic step
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      // Complete user step
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => {
        expect(screen.queryByText('Configure redpanda input')).not.toBeInTheDocument();
      });
    });

    it('closes the connector picker when a Redpanda component is selected', () => {
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      expect(props.onClose).toHaveBeenCalled();
    });

    it('cancelling the setup dialog does not generate YAML', async () => {
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));
      expect(screen.getByText('Configure redpanda input')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByText('Configure redpanda input')).not.toBeInTheDocument();
      });
      expect(applyRedpandaSetup).not.toHaveBeenCalled();
      expect(props.onYamlChange).not.toHaveBeenCalled();
    });

    it('does not call onYamlChange when applyRedpandaSetup returns undefined', async () => {
      vi.mocked(applyRedpandaSetup).mockReturnValue(undefined);
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      // Complete topic step
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      // Complete user step
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => {
        expect(applyRedpandaSetup).toHaveBeenCalled();
      });
      expect(props.onYamlChange).not.toHaveBeenCalled();
      // Dialog should still close
      await waitFor(() => {
        expect(screen.queryByText('Configure redpanda input')).not.toBeInTheDocument();
      });
    });

    it('passes service-account auth data to applyRedpandaSetup', async () => {
      mockUserSubmit.mockResolvedValue({
        success: true,
        data: {
          authMethod: 'service-account',
          serviceAccountName: 'sa-name',
          serviceAccountId: 'sa-id',
          serviceAccountSecretName: 'sa-secret',
        },
      });

      renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      // Complete topic step
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      // Complete user step
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => {
        expect(applyRedpandaSetup).toHaveBeenCalledWith(
          expect.objectContaining({
            result: expect.objectContaining({
              authMethod: 'service-account',
              serviceAccountName: 'sa-name',
              serviceAccountId: 'sa-id',
              serviceAccountSecretName: 'sa-secret',
            }),
          })
        );
      });
    });
  });

  describe('skipping Redpanda setup steps', () => {
    it('skipping the topic step does not require a topic to be configured', async () => {
      renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

      await waitFor(() => {
        expect(screen.getByTestId('add-user-step')).toBeInTheDocument();
      });

      expect(mockTopicSubmit).not.toHaveBeenCalled();
    });

    it('user can go back to the topic step after advancing', async () => {
      renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));

      await waitFor(() => {
        expect(screen.getByTestId('add-topic-step')).toBeInTheDocument();
      });
    });

    it('skipping topic then completing user calls applyRedpandaSetup with user data only', async () => {
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      // Skip topic
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      // Complete user
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));

      await waitFor(() => {
        expect(applyRedpandaSetup).toHaveBeenCalledWith(
          expect.objectContaining({
            result: expect.objectContaining({ authMethod: 'sasl', username: 'test-user' }),
          })
        );
        // topicName should be undefined since topic step was skipped
        const call = vi.mocked(applyRedpandaSetup).mock.calls[0][0];
        expect(call.result.topicName).toBeUndefined();
      });
      expect(props.onYamlChange).toHaveBeenCalledWith('patched:\n  yaml: {}');
    });

    it('skipping all steps still inserts a base template', async () => {
      const { props } = renderWizard();

      fireEvent.click(screen.getByTestId('select-redpanda'));

      // Skip topic → user step
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
      await waitFor(() => expect(screen.getByTestId('add-user-step')).toBeInTheDocument());

      // Skip user (last step) → calls onComplete({}) which generates base template
      fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

      await waitFor(() => {
        expect(applyRedpandaSetup).toHaveBeenCalledWith(expect.objectContaining({ result: {} }));
      });
      expect(props.onYamlChange).toHaveBeenCalledWith('patched:\n  yaml: {}');
    });
  });
});
