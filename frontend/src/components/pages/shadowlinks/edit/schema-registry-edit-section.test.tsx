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

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';
import { useSupportedFeaturesStore } from 'state/supported-features';
import { render, screen } from 'test-utils';

import { SchemaRegistryEditSection, type SchemaRegistryEditSectionProps } from './schema-registry-edit-section';
import { FormSchema, type FormValues, initialValues, SCHEMA_REGISTRY_MODE } from '../create/model';
import { setSchemaRegistrySyncGateSupported as setSrSyncSupported } from '../shadowlink-test-helpers';

const hydratedApiValues = (): FormValues => {
  const values = structuredClone(initialValues);
  values.schemaRegistry.mode = SCHEMA_REGISTRY_MODE.API;
  values.schemaRegistry.sourceUrl = 'https://sr.example.com';
  values.schemaRegistry.scopeMode = 'specify';
  values.schemaRegistry.contexts = ['.prod'];
  values.schemaRegistry.syncBehavior.tailInterval = '10s';
  return values;
};

const hydratedTopicValues = (): FormValues => {
  const values = structuredClone(initialValues);
  values.schemaRegistry.mode = SCHEMA_REGISTRY_MODE.TOPIC;
  values.enableSchemaRegistrySync = true;
  return values;
};

const TestWrapper = ({
  defaultValues = initialValues,
  ...props
}: SchemaRegistryEditSectionProps & { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form>
        <SchemaRegistryEditSection {...props} />
      </form>
    </Form>
  );
};

describe('SchemaRegistryEditSection', () => {
  beforeEach(() => {
    useSupportedFeaturesStore.setState({ endpointCompatibility: null, shadowLinkSchemaRegistrySync: false });
  });

  describe('gate closed (older backend)', () => {
    beforeEach(() => {
      setSrSyncSupported(false);
    });

    test('renders the legacy switch for a topic-mode link', () => {
      render(<TestWrapper defaultValues={hydratedTopicValues()} originalMode={SCHEMA_REGISTRY_MODE.TOPIC} />);

      expect(screen.getByTestId('sr-enable-switch')).toBeInTheDocument();
      expect(screen.queryByTestId('shadow-schema-registry-section')).not.toBeInTheDocument();
    });

    test('keeps the read-only card for an api-mode link', () => {
      render(<TestWrapper defaultValues={hydratedApiValues()} originalMode={SCHEMA_REGISTRY_MODE.API} />);

      expect(screen.getByTestId('sr-api-mode-readonly')).toBeInTheDocument();
      expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();
    });
  });

  describe('gate open', () => {
    beforeEach(() => {
      setSrSyncSupported(true);
    });

    test('renders the full editor hydrated from an api-mode link', () => {
      render(<TestWrapper defaultValues={hydratedApiValues()} originalMode={SCHEMA_REGISTRY_MODE.API} />);

      expect(screen.getByTestId('shadow-schema-registry-section')).toBeInTheDocument();
      expect(screen.queryByTestId('sr-api-mode-readonly')).not.toBeInTheDocument();
      expect(screen.getByTestId('sr-source-url-input')).toHaveValue('https://sr.example.com');
      expect(screen.getByTestId('sr-contexts-input-chip-.prod')).toBeInTheDocument();
    });

    test('locks the opposite mode tab and shows the hint', () => {
      render(<TestWrapper defaultValues={hydratedApiValues()} originalMode={SCHEMA_REGISTRY_MODE.API} />);

      expect(screen.getByTestId('sr-mode-topic-tab')).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('sr-mode-none-tab')).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('sr-mode-locked-hint')).toBeInTheDocument();
    });

    test('leaves all mode tabs enabled when the link had no SR shadowing', () => {
      render(<TestWrapper originalMode={SCHEMA_REGISTRY_MODE.NONE} />);

      expect(screen.getByTestId('sr-mode-topic-tab')).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByTestId('sr-mode-api-tab')).not.toHaveAttribute('aria-disabled', 'true');
      expect(screen.queryByTestId('sr-mode-locked-hint')).not.toBeInTheDocument();
    });

    test('warns when leaving topic mode and clears the warning on return', async () => {
      const user = userEvent.setup();
      render(<TestWrapper defaultValues={hydratedTopicValues()} originalMode={SCHEMA_REGISTRY_MODE.TOPIC} />);

      expect(screen.queryByTestId('sr-mode-transition-topic-alert')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('sr-mode-none-tab'));
      expect(screen.getByTestId('sr-mode-transition-topic-alert')).toBeInTheDocument();

      await user.click(screen.getByTestId('sr-mode-topic-tab'));
      expect(screen.queryByTestId('sr-mode-transition-topic-alert')).not.toBeInTheDocument();
    });

    test('warns that api settings are discarded when switching to none', async () => {
      const user = userEvent.setup();
      render(<TestWrapper defaultValues={hydratedApiValues()} originalMode={SCHEMA_REGISTRY_MODE.API} />);

      await user.click(screen.getByTestId('sr-mode-none-tab'));
      expect(screen.getByTestId('sr-mode-transition-api-alert')).toBeInTheDocument();
    });

    test('reconciles a legacy switch-off made before the gate opened', () => {
      // The switch was toggled off while the gate was closed: the boolean is
      // false but the mode still says topic. The tabs must not disagree with
      // what would be submitted.
      const staleValues = hydratedTopicValues();
      staleValues.enableSchemaRegistrySync = false;

      render(<TestWrapper defaultValues={staleValues} originalMode={SCHEMA_REGISTRY_MODE.TOPIC} />);

      expect(screen.getByTestId('sr-mode-description')).toHaveTextContent('Schema Registry shadowing is off');
    });
  });
});
