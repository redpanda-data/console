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

import { zodResolver } from '@hookform/resolvers/zod';
import userEvent from '@testing-library/user-event';
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';
import { Feature, useSupportedFeaturesStore } from 'state/supported-features';
import { render, screen, waitFor } from 'test-utils';

import { LegacySchemaRegistrySection, SchemaRegistryStep } from './schema-registry-step';
import { FormSchema, type FormValues, initialValues, SCHEMA_REGISTRY_MODE } from '../model';

// Drive the real supported-features store the way the app does at boot, so the
// gate exercises the actual endpoint-compatibility fail-closed logic instead of
// a mock: a supported endpoint yields the redesigned section, anything else
// (unsupported, absent, or a never-loaded null store) yields the legacy switch.
const setSrSyncSupported = (isSupported: boolean) => {
  useSupportedFeaturesStore.getState().setEndpointCompatibility({
    kafkaVersion: 'v26.2.0',
    endpoints: [
      {
        endpoint: Feature.ShadowLinkSchemaRegistrySync.endpoint,
        method: Feature.ShadowLinkSchemaRegistrySync.method,
        isSupported,
      },
    ],
  });
};

const TestWrapper = ({
  defaultValues = initialValues,
  onFormChange,
}: {
  defaultValues?: FormValues;
  onFormChange?: (values: FormValues) => void;
}) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  if (onFormChange) {
    form.watch((values) => {
      onFormChange(values as FormValues);
    });
  }

  return (
    <Form {...form}>
      <form>
        <SchemaRegistryStep />
      </form>
    </Form>
  );
};

describe('SchemaRegistryStep', () => {
  beforeEach(() => {
    // Reset the shared store before each test. null models the boot fetch not
    // yet having resolved (or having failed and never retried).
    useSupportedFeaturesStore.setState({ endpointCompatibility: null, shadowLinkSchemaRegistrySync: false });
  });

  describe('Legacy switch (gate closed)', () => {
    beforeEach(() => {
      setSrSyncSupported(false);
    });

    test('should toggle enableSchemaRegistrySync value when switch is clicked', async () => {
      const user = userEvent.setup();
      let formValues: FormValues | undefined;

      render(
        <TestWrapper
          onFormChange={(values) => {
            formValues = values;
          }}
        />
      );

      const switchElement = screen.getByTestId('sr-enable-switch');

      expect(switchElement).toHaveAttribute('aria-checked', 'false');

      await user.click(switchElement);

      await waitFor(() => {
        expect(switchElement).toHaveAttribute('aria-checked', 'true');
        expect(formValues?.enableSchemaRegistrySync).toBe(true);
      });

      await user.click(switchElement);

      await waitFor(() => {
        expect(switchElement).toHaveAttribute('aria-checked', 'false');
        expect(formValues?.enableSchemaRegistrySync).toBe(false);
      });
    });

    test('should reset stale redesigned values and keep topic mode as the switch being on', async () => {
      let formValues: FormValues | undefined;

      render(
        <TestWrapper
          defaultValues={{
            ...initialValues,
            enableSchemaRegistrySync: true,
            schemaRegistry: {
              ...initialValues.schemaRegistry,
              mode: SCHEMA_REGISTRY_MODE.TOPIC,
              sourceUrl: 'https://stale.example.com',
            },
          }}
          onFormChange={(values) => {
            formValues = values;
          }}
        />
      );

      await waitFor(() => {
        expect(formValues?.schemaRegistry?.mode).toBe(SCHEMA_REGISTRY_MODE.NONE);
        expect(formValues?.schemaRegistry?.sourceUrl).toBe('');
        expect(formValues?.enableSchemaRegistrySync).toBe(true);
      });
      expect(screen.getByTestId('sr-enable-switch')).toBeInTheDocument();
    });

    test('should turn the switch off when a stale api mode falls back', async () => {
      let formValues: FormValues | undefined;

      render(
        <TestWrapper
          defaultValues={{
            ...initialValues,
            enableSchemaRegistrySync: false,
            schemaRegistry: {
              ...initialValues.schemaRegistry,
              mode: SCHEMA_REGISTRY_MODE.API,
              sourceUrl: 'https://stale.example.com',
            },
          }}
          onFormChange={(values) => {
            formValues = values;
          }}
        />
      );

      await waitFor(() => {
        expect(formValues?.schemaRegistry?.mode).toBe(SCHEMA_REGISTRY_MODE.NONE);
        expect(formValues?.enableSchemaRegistrySync).toBe(false);
      });
    });
  });

  describe('Gate states', () => {
    test('should fall back to the legacy switch while endpoint compatibility has not loaded (or the fetch failed)', () => {
      // store left at its default null by the beforeEach reset
      render(<TestWrapper />);

      expect(screen.getByTestId('sr-enable-switch')).toBeInTheDocument();
      expect(screen.queryByTestId('shadow-schema-registry-section')).not.toBeInTheDocument();
    });

    test('should fall back to the legacy switch when the backend reports SR sync as unsupported', () => {
      setSrSyncSupported(false);

      render(<TestWrapper />);

      expect(screen.getByTestId('sr-enable-switch')).toBeInTheDocument();
      expect(screen.queryByTestId('shadow-schema-registry-section')).not.toBeInTheDocument();
    });

    test('should fall back to the legacy switch when an older backend omits the SR sync endpoint entirely', () => {
      useSupportedFeaturesStore.getState().setEndpointCompatibility({ kafkaVersion: 'v25.1.0', endpoints: [] });

      render(<TestWrapper />);

      expect(screen.getByTestId('sr-enable-switch')).toBeInTheDocument();
      expect(screen.queryByTestId('shadow-schema-registry-section')).not.toBeInTheDocument();
    });

    test('should show the redesigned section when the backend reports SR sync as supported', () => {
      setSrSyncSupported(true);

      render(<TestWrapper />);

      expect(screen.getByTestId('shadow-schema-registry-section')).toBeInTheDocument();
      expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();
    });
  });

  describe('LegacySchemaRegistrySection read-only (edit page, api-mode link)', () => {
    const LegacyWrapper = ({ readOnlyApiMode }: { readOnlyApiMode?: boolean }) => {
      const form = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: initialValues });
      return (
        <Form {...form}>
          <form>
            <LegacySchemaRegistrySection readOnlyApiMode={readOnlyApiMode} />
          </form>
        </Form>
      );
    };

    test('renders a read-only notice and hides the switch so it cannot downgrade api sync', () => {
      render(<LegacyWrapper readOnlyApiMode />);

      expect(screen.getByTestId('sr-api-mode-readonly')).toBeInTheDocument();
      expect(screen.queryByTestId('sr-enable-switch')).not.toBeInTheDocument();
    });

    test('renders the switch when the link is not api mode', () => {
      render(<LegacyWrapper />);

      expect(screen.getByTestId('sr-enable-switch')).toBeInTheDocument();
      expect(screen.queryByTestId('sr-api-mode-readonly')).not.toBeInTheDocument();
    });
  });
});
