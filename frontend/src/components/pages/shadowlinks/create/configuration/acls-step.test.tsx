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
import { ACLOperation, ACLPattern, ACLPermissionType, ACLResource } from 'protogen/redpanda/core/common/acl_pb';
import { useForm } from 'react-hook-form';
import { fireEvent, render, screen, waitFor, within } from 'test-utils';

import { AclsStep } from './acls-step';
import { FormSchema, type FormValues, initialValues } from '../model';

const ACL_FILTER_PATTERN = /^acl-filter-\d+$/;

const TestWrapper = ({ defaultValues = initialValues }: { defaultValues?: FormValues }) => {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues,
  });

  return (
    <Form {...form}>
      <form>
        <AclsStep />
      </form>
    </Form>
  );
};

describe('AclsStep', () => {
  describe('Adding ACL filters', () => {
    test('should add new ACL filter with default values that match allow all', async () => {
      const customValues: FormValues = {
        ...initialValues,
        aclsMode: 'specify',
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_ANY,
            resourcePattern: ACLPattern.ACL_PATTERN_ANY,
            resourceName: '',
            principal: '',
            operation: ACLOperation.ACL_OPERATION_ANY,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
            host: '',
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('acls-toggle-button');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('acl-filter-0')).toBeInTheDocument();
      });

      // Verify default values match "allow all" pattern
      const filter0 = screen.getByTestId('acl-filter-0');

      // Check that the resource type field has "Any" selected (ACL_RESOURCE_ANY = 0)
      const resourceTypeField = within(filter0).getByTestId('acl-filter-0-resource-type');
      const resourceTypeButton = within(resourceTypeField).getByRole('combobox');
      expect(resourceTypeButton).toHaveTextContent('Any');
    });

    test('should create multiple ACL filters', async () => {
      const customValues: FormValues = {
        ...initialValues,
        aclsMode: 'specify',
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_ANY,
            resourcePattern: ACLPattern.ACL_PATTERN_ANY,
            resourceName: '',
            principal: '',
            operation: ACLOperation.ACL_OPERATION_ANY,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
            host: '',
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('acls-toggle-button');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('acl-filter-0')).toBeInTheDocument();
      });

      // Add second filter
      const addButton = screen.getByTestId('add-acl-filter-button');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByTestId('acl-filter-1')).toBeInTheDocument();
      });

      // Verify both filters exist
      expect(screen.getByTestId('acl-filter-0')).toBeInTheDocument();
      expect(screen.getByTestId('acl-filter-1')).toBeInTheDocument();
    });
  });

  describe('Deleting ACL filters', () => {
    test('should delete ACL filters', async () => {
      const customValues: FormValues = {
        ...initialValues,
        aclsMode: 'specify',
        aclFilters: [
          {
            resourceType: ACLResource.ACL_RESOURCE_ANY,
            resourcePattern: ACLPattern.ACL_PATTERN_ANY,
            resourceName: '',
            principal: '',
            operation: ACLOperation.ACL_OPERATION_ANY,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ANY,
            host: '',
          },
          {
            resourceType: ACLResource.ACL_RESOURCE_TOPIC,
            resourcePattern: ACLPattern.ACL_PATTERN_LITERAL,
            resourceName: 'test-topic',
            principal: 'User:test',
            operation: ACLOperation.ACL_OPERATION_READ,
            permissionType: ACLPermissionType.ACL_PERMISSION_TYPE_ALLOW,
            host: '*',
          },
        ],
      };

      render(<TestWrapper defaultValues={customValues} />);

      // Need to open the collapsible to see the editable filters
      const toggleButton = screen.getByTestId('acls-toggle-button');
      fireEvent.click(toggleButton);

      await waitFor(() => {
        expect(screen.getByTestId('acl-filter-0')).toBeInTheDocument();
        expect(screen.getByTestId('acl-filter-1')).toBeInTheDocument();
      });

      // Delete the first filter
      const deleteButton = screen.getByTestId('delete-acl-filter-0');
      fireEvent.click(deleteButton);

      await waitFor(() => {
        // The second filter should now be at index 0
        expect(screen.getByTestId('acl-filter-0')).toBeInTheDocument();
        // The old filter at index 1 should not exist anymore
        expect(screen.queryByTestId('acl-filter-1')).not.toBeInTheDocument();
      });

      // Verify only one filter remains
      expect(screen.getAllByTestId(ACL_FILTER_PATTERN)).toHaveLength(1);
    });
  });
});
