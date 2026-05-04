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

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import type { editor } from 'monaco-editor';
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { ListTopicsResponse_TopicSchema, ListTopicsResponseSchema } from 'protogen/redpanda/api/dataplane/v1/topic_pb';
import { listTopics } from 'protogen/redpanda/api/dataplane/v1/topic-TopicService_connectquery';
import { ListUsersResponse_UserSchema, ListUsersResponseSchema } from 'protogen/redpanda/api/dataplane/v1/user_pb';
import { listUsers } from 'protogen/redpanda/api/dataplane/v1/user-UserService_connectquery';
import { render, screen, waitFor } from 'test-utils';
import { describe, expect, it, vi } from 'vitest';

import { PipelineCommandMenu } from './pipeline-command-menu';

// cmdk calls scrollIntoView on selected items — JSDOM does not implement it
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Mock editor factory
// ---------------------------------------------------------------------------

function createMockEditor() {
  return {
    getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
    getModel: vi.fn(() => ({
      getLineContent: vi.fn(() => ''),
      getLineMaxColumn: vi.fn(() => 1),
      getValue: vi.fn(() => ''),
    })),
    executeEdits: vi.fn(),
    setPosition: vi.fn(),
    focus: vi.fn(),
    getDomNode: vi.fn(() => null),
    getScrolledVisiblePosition: vi.fn(() => null),
    onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as editor.IStandaloneCodeEditor;
}

// ---------------------------------------------------------------------------
// Transport factory — registers all three RPCs used by PipelineCommandMenu
// ---------------------------------------------------------------------------

function createTestTransport({
  secretNames = [] as string[],
  topicNames = [] as string[],
  userNames = [] as string[],
} = {}) {
  return createRouterTransport(({ rpc }) => {
    rpc(listSecrets, () =>
      create(ListSecretsResponseSchema, {
        response: {
          secrets: secretNames.map((id) => create(SecretSchema, { id })),
          nextPageToken: '',
        },
      })
    );

    rpc(listTopics, () =>
      create(ListTopicsResponseSchema, {
        topics: topicNames.map((name) => create(ListTopicsResponse_TopicSchema, { name })),
        nextPageToken: '',
      })
    );

    rpc(listUsers, () =>
      create(ListUsersResponseSchema, {
        users: userNames.map((name) => create(ListUsersResponse_UserSchema, { name })),
        nextPageToken: '',
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Helper: query category group headings (rendered as h5 elements)
function getHeading(name: string) {
  return screen.getByRole('heading', { name, level: 5 });
}

function queryHeading(name: string) {
  return screen.queryByRole('heading', { name, level: 5 });
}

describe('PipelineCommandMenu', () => {
  it('dialog variant renders all category group headings', async () => {
    const transport = createTestTransport();

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(getHeading('Contextual variables')).toBeInTheDocument();
      expect(getHeading('Secrets')).toBeInTheDocument();
      expect(getHeading('Topics')).toBeInTheDocument();
      expect(getHeading('Users')).toBeInTheDocument();
    });
  });

  it('secret items appear in the list with correct syntax', async () => {
    const transport = createTestTransport({ secretNames: ['MY_API_KEY', 'DB_PASSWORD'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(screen.getByText('secrets.MY_API_KEY')).toBeInTheDocument();
      expect(screen.getByText('secrets.DB_PASSWORD')).toBeInTheDocument();
    });
  });

  it('selecting a contextual variable calls executeEdits and closes the menu', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport();
    const mockEditor = createMockEditor();
    const onOpenChange = vi.fn();

    render(<PipelineCommandMenu editorInstance={mockEditor} onOpenChange={onOpenChange} open variant="dialog" />, {
      transport,
    });

    // Wait for contextual variables to render
    expect(await screen.findByText('${REDPANDA_BROKERS}')).toBeInTheDocument();

    // Click the first contextual variable item
    await user.click(screen.getByText('${REDPANDA_BROKERS}'));

    await waitFor(() => {
      expect(mockEditor.executeEdits).toHaveBeenCalledWith(
        'command-menu-insert',
        expect.arrayContaining([expect.objectContaining({ text: '${REDPANDA_BROKERS}' })])
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('category filter toggle shows only the selected category', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport({ secretNames: ['SECRET_ONE'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
      transport,
    });

    // Wait for all groups to be visible initially
    await waitFor(() => {
      expect(getHeading('Contextual variables')).toBeInTheDocument();
      expect(getHeading('Secrets')).toBeInTheDocument();
    });

    // Click the "Secrets" toggle (single-select ToggleGroupItem renders as role="radio")
    await user.click(screen.getByRole('radio', { name: 'Secrets' }));

    await waitFor(() => {
      expect(getHeading('Secrets')).toBeInTheDocument();
      expect(queryHeading('Contextual variables')).not.toBeInTheDocument();
    });
  });

  it('popover variant renders Command component', async () => {
    const transport = createTestTransport();

    render(
      <PipelineCommandMenu
        editorInstance={createMockEditor()}
        onOpenChange={vi.fn()}
        onSlashSelect={vi.fn()}
        open
        slashPosition={{ lineNumber: 1, column: 1 }}
        variant="popover"
      />,
      { transport }
    );

    // The popover renders a cmdk input for filtering
    expect(await screen.findByPlaceholderText('Filter...')).toBeInTheDocument();
  });

  it('popover selection calls onSlashSelect with variable text', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport();
    const onSlashSelect = vi.fn();

    render(
      <PipelineCommandMenu
        editorInstance={createMockEditor()}
        onOpenChange={vi.fn()}
        onSlashSelect={onSlashSelect}
        open
        slashPosition={{ lineNumber: 1, column: 1 }}
        variant="popover"
      />,
      { transport }
    );

    await user.click(await screen.findByText('${REDPANDA_BROKERS}'));

    await waitFor(() => {
      expect(onSlashSelect).toHaveBeenCalledWith('${REDPANDA_BROKERS}');
    });
  });

  it('topic items from API appear in list', async () => {
    const transport = createTestTransport({ topicNames: ['my-topic', 'orders'] });

    render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
      transport,
    });

    await waitFor(() => {
      expect(screen.getByText('my-topic')).toBeInTheDocument();
      expect(screen.getByText('orders')).toBeInTheDocument();
    });
  });

  it('"Create secret" button opens AddSecretsDialog', async () => {
    const user = userEvent.setup();
    const transport = createTestTransport({ secretNames: ['EXISTING_KEY'] });
    const onOpenChange = vi.fn();

    render(
      <PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={onOpenChange} open variant="dialog" />,
      {
        transport,
      }
    );

    // Wait for secrets to load so the footer button is visible
    expect(await screen.findByText('secrets.EXISTING_KEY')).toBeInTheDocument();

    // Click the "Create secret" button in the footer
    await user.click(screen.getByRole('button', { name: /Create secret/i }));

    // openSubDialog calls onOpenChange(false) before opening the sub-dialog
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('create buttons', () => {
    it('"All" tab shows all three create buttons', async () => {
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
        transport,
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create secret/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create topic/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
      });
    });

    it('"Secrets" tab shows only "Create secret"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create secret/i })).toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: 'Secrets' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create secret/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });

    it('"Topics" tab shows only "Create topic"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create topic/i })).toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: 'Topics' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create topic/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });

    it('"Users" tab shows only "Create user"', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create user/i })).toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: 'Users' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument();
      });
    });

    it('"Variables" tab shows no create buttons', async () => {
      const user = userEvent.setup();
      const transport = createTestTransport();

      render(<PipelineCommandMenu editorInstance={createMockEditor()} onOpenChange={vi.fn()} open variant="dialog" />, {
        transport,
      });

      expect(await screen.findByRole('button', { name: /create secret/i })).toBeInTheDocument();

      await user.click(screen.getByRole('radio', { name: 'Variables' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create secret/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create topic/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /create user/i })).not.toBeInTheDocument();
      });
    });

    it('popover shows all three create buttons', async () => {
      const transport = createTestTransport();

      render(
        <PipelineCommandMenu
          editorInstance={createMockEditor()}
          onOpenChange={vi.fn()}
          onSlashSelect={vi.fn()}
          open
          slashPosition={{ lineNumber: 1, column: 1 }}
          variant="popover"
        />,
        { transport }
      );

      // Wait for the popover content to render including footer buttons
      await waitFor(() => {
        expect(screen.getByText('Create secret')).toBeInTheDocument();
        expect(screen.getByText('Create topic')).toBeInTheDocument();
        expect(screen.getByText('Create user')).toBeInTheDocument();
      });
    });
  });
});
