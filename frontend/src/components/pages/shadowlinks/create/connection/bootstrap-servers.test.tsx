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
import { Form } from 'components/redpanda-ui/components/form';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen, waitFor } from 'test-utils';

import { BootstrapServers } from './bootstrap-servers';
import { FormSchema, type FormValues, initialValues } from '../model';

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
    mode: 'onBlur', // Enable validation on blur
  });

  return (
    <Form {...form}>
      <form>
        <BootstrapServers />
      </form>
    </Form>
  );
};

// Helper to get bootstrap server input
const getBootstrapInput = (index: number) => screen.getByTestId(`bootstrap-server-input-${index}`);

// Validation error message
const ERROR_MESSAGE = 'Must be in format host:port (e.g., localhost:9092)';

describe('BootstrapServers', () => {
  describe('Rendering', () => {
    test('should show delete button only when multiple servers exist', () => {
      const customValues: FormValues = {
        ...initialValues,
        bootstrapServers: [{ value: 'broker1:9092' }, { value: 'broker2:9092' }],
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('delete-bootstrap-server-0')).toBeVisible();
      expect(screen.getByTestId('delete-bootstrap-server-1')).toBeVisible();
    });
  });

  describe('Broker format validation', () => {
    test('should accept valid broker format (host:port)', async () => {
      render(<TestWrapper />);

      const input = getBootstrapInput(0);
      fireEvent.change(input, { target: { value: 'localhost:9092' } });

      await waitFor(() => {
        expect(input).toHaveValue('localhost:9092');
      });
    });

    test('should accept valid broker with domain name', async () => {
      render(<TestWrapper />);

      const input = getBootstrapInput(0);
      fireEvent.change(input, { target: { value: 'kafka.example.com:9092' } });

      await waitFor(() => {
        expect(input).toHaveValue('kafka.example.com:9092');
      });
    });

    test('should accept valid broker with IP address', async () => {
      render(<TestWrapper />);

      const input = getBootstrapInput(0);
      fireEvent.change(input, { target: { value: '192.168.1.100:9092' } });

      await waitFor(() => {
        expect(input).toHaveValue('192.168.1.100:9092');
      });
    });

    test('should show error for invalid formats', async () => {
      render(<TestWrapper />);

      const input = getBootstrapInput(0);

      fireEvent.change(input, { target: { value: 'localhost' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();
      });

      fireEvent.change(input, { target: { value: 'localhost:9092' } });
      fireEvent.blur(input);

      await waitFor(() => {
        expect(screen.queryByText(ERROR_MESSAGE)).not.toBeInTheDocument();
      });
    });
  });

  describe('Adding and removing brokers', () => {
    test('should add a new broker field when clicking Add URL button', async () => {
      render(<TestWrapper />);

      const addButton = screen.getByTestId('add-bootstrap-server-button');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('bootstrap-server-input-0')).toBeInTheDocument();
        expect(screen.getByTestId('bootstrap-server-input-1')).toBeInTheDocument();
      });
    });

    test('should add multiple broker fields', async () => {
      render(<TestWrapper />);

      const addButton = screen.getByTestId('add-bootstrap-server-button');

      fireEvent.click(addButton);
      fireEvent.click(addButton);
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('bootstrap-server-input-0')).toBeInTheDocument();
        expect(screen.getByTestId('bootstrap-server-input-1')).toBeInTheDocument();
        expect(screen.getByTestId('bootstrap-server-input-2')).toBeInTheDocument();
        expect(screen.getByTestId('bootstrap-server-input-3')).toBeInTheDocument();
      });
    });

    test('should remove a broker field when clicking delete button', async () => {
      const customValues: FormValues = {
        ...initialValues,
        bootstrapServers: [{ value: 'broker1:9092' }, { value: 'broker2:9092' }],
      };

      render(<TestWrapper defaultValues={customValues} />);

      expect(screen.getByTestId('bootstrap-server-input-0')).toBeInTheDocument();
      expect(screen.getByTestId('bootstrap-server-input-1')).toBeInTheDocument();

      const deleteButton = screen.getByTestId('delete-bootstrap-server-0');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(getBootstrapInput(0)).toHaveValue('broker2:9092');
        expect(screen.queryByTestId('bootstrap-server-input-1')).not.toBeInTheDocument();
      });
    });
  });

  describe('Integration', () => {
    test('should handle complete workflow: add broker, fill values, toggle TLS', async () => {
      render(<TestWrapper />);

      const input0 = getBootstrapInput(0);
      fireEvent.change(input0, { target: { value: 'kafka1.example.com:9092' } });

      const addButton = screen.getByTestId('add-bootstrap-server-button');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('bootstrap-server-input-1')).toBeInTheDocument();
      });

      const input1 = getBootstrapInput(1);
      fireEvent.change(input1, { target: { value: 'kafka2.example.com:9092' } });

      const disabledTab = screen.getByTestId('tls-disabled-tab');
      fireEvent.click(disabledTab);

      await waitFor(() => {
        expect(input0).toHaveValue('kafka1.example.com:9092');
        expect(input1).toHaveValue('kafka2.example.com:9092');
        expect(disabledTab).toHaveAttribute('aria-selected', 'true');
      });
    });
  });
});
