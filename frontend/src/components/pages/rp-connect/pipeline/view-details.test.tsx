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
import { TooltipProvider } from 'components/redpanda-ui/components/tooltip';
import { Pipeline_State, PipelineSchema } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { ComponentProps } from 'react';
import { render, screen } from 'test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ViewDetails } from './view-details';

function renderViewDetails(props: ComponentProps<typeof ViewDetails>) {
  return render(
    <TooltipProvider>
      <ViewDetails {...props} />
    </TooltipProvider>
  );
}

function createPipeline(overrides: Record<string, unknown> = {}) {
  return create(PipelineSchema, {
    id: 'pipeline-123',
    displayName: 'Test Pipeline',
    description: 'A test pipeline',
    state: Pipeline_State.RUNNING,
    configYaml: 'input:\n  stdin: {}\noutput:\n  stdout: {}',
    url: 'https://pipeline.example.com/pipeline-123',
    resources: { cpuShares: '300m', memoryShares: '0' },
    tags: {},
    ...overrides,
  });
}

describe('ViewDetails', () => {
  it('renders pipeline ID with copy button', () => {
    renderViewDetails({ pipeline: createPipeline() });
    expect(screen.getByText('pipeline-123')).toBeInTheDocument();
  });

  it('renders description', () => {
    renderViewDetails({ pipeline: createPipeline() });
    expect(screen.getByText('A test pipeline')).toBeInTheDocument();
  });

  it('renders compute units', () => {
    renderViewDetails({ pipeline: createPipeline() });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders URL with copy button', () => {
    renderViewDetails({ pipeline: createPipeline() });
    expect(screen.getByText('https://pipeline.example.com/pipeline-123')).toBeInTheDocument();
  });

  it('renders service account when present', () => {
    renderViewDetails({
      pipeline: createPipeline({
        serviceAccount: { clientId: 'sa-client-id', clientSecret: '' },
      }),
    });
    expect(screen.getByText('sa-client-id')).toBeInTheDocument();
  });

  it('renders user-visible tags in References card as key: value badges', () => {
    renderViewDetails({
      pipeline: createPipeline({
        tags: { env: 'production', team: 'platform' },
      }),
    });
    expect(screen.getByText('env: production')).toBeInTheDocument();
    expect(screen.getByText('team: platform')).toBeInTheDocument();
  });

  it('hides system tags (__-prefixed)', () => {
    renderViewDetails({
      pipeline: createPipeline({
        tags: {
          __redpanda_cloud_pipeline_type: 'pipeline',
          env: 'staging',
        },
      }),
    });
    expect(screen.getByText('env: staging')).toBeInTheDocument();
    expect(screen.queryByText('__redpanda_cloud_pipeline_type')).not.toBeInTheDocument();
  });

  it('renders secrets in References card', () => {
    renderViewDetails({
      pipeline: createPipeline({
        configYaml: [
          'input:',
          '  stdin: {}',
          'output:',
          '  stdout:',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: secret template syntax
          '    password: "${secrets.my_secret.password}"',
        ].join('\n'),
      }),
    });
    expect(screen.getByText('my_secret')).toBeInTheDocument();
  });

  it('renders topics in References card', () => {
    renderViewDetails({
      pipeline: createPipeline({
        configYaml: 'input:\n  kafka_franz:\n    seed_brokers: []\n    topics: ["my-topic"]\noutput:\n  stdout: {}',
      }),
    });
    expect(screen.getByText('my-topic')).toBeInTheDocument();
  });

  it('renders delete button when onDelete provided', () => {
    renderViewDetails({ isDeleting: false, onDelete: vi.fn(), pipeline: createPipeline() });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not render delete section when onDelete is undefined', () => {
    renderViewDetails({ pipeline: createPipeline() });
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
    expect(screen.queryByText('Danger zone')).not.toBeInTheDocument();
  });
});
