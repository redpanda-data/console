# Form Template with Proto Validation

Copy this template when creating a new form with proto validation.

## File Structure

```
src/components/pages/my-feature/
├── schemas.ts              # Form types and validation
├── my-feature-page.tsx     # Main form component
└── schemas.test.ts         # Tests
```

## schemas.ts Template

```typescript
import { create } from '@bufbuild/protobuf';
import type { ValidationResult } from 'utils/form-validation';
import {
  MyProtoSchema,
  type MyProto,
} from 'protogen/my/api/v1/my_pb';

/**
 * Form values type - plain TypeScript for better DX
 */
export type MyFormValues = {
  // TODO: Define your form fields
  name: string;
  description?: string;
  // Add more fields...
};

/**
 * Initial form values
 */
export const initialValues: MyFormValues = {
  name: '',
  description: '',
};

/**
 * Custom validation function for cross-field logic
 *
 * @param values - Form values to validate
 * @returns Validation result with errors by field path
 */
export function validateFormValues(values: MyFormValues): ValidationResult {
  const errors: Record<string, string> = {};

  // TODO: Add your custom validation logic
  // Examples:

  // Required field
  // if (!values.name || values.name.trim() === '') {
  //   errors.name = 'Name is required';
  // }

  // Cross-field validation
  // if (values.endDate && values.startDate && values.endDate < values.startDate) {
  //   errors.endDate = 'End date must be after start date';
  // }

  // Conditional validation
  // if (values.type === 'premium' && !values.licenseKey) {
  //   errors.licenseKey = 'License key required for premium type';
  // }

  // Regex validation
  // if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
  //   errors.email = 'Invalid email format';
  // }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Build proto message from form values
 *
 * @param values - Form values
 * @returns Proto message ready for API submission
 */
export function buildProtoMessage(values: MyFormValues): MyProto {
  // TODO: Create and return your proto message
  return create(MyProtoSchema, {
    name: values.name,
    description: values.description || '',
    // Map more fields...
  });
}
```

## my-feature-page.tsx Template

```typescript
'use client';

import { create } from '@bufbuild/protobuf';
import type { ConnectError } from '@connectrpc/connect';
import { Button } from 'components/redpanda-ui/components/button';
import { Form, FormContainer } from 'components/redpanda-ui/components/form';
import {
  Field,
  FieldError,
  FieldLabel,
} from 'components/redpanda-ui/components/field';
import { Input } from 'components/redpanda-ui/components/input';
import { Heading, Text } from 'components/redpanda-ui/components/typography';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createFormResolver, validateProtoMessage } from 'utils/form-validation';
import { formatToastErrorMessageGRPC } from 'utils/toast.utils';
import {
  CreateMyRequestSchema,
  MyProtoSchema,
} from 'protogen/my/api/v1/my_pb';
import { useCreateMyMutation } from 'react-query/api/my-feature';

import {
  buildProtoMessage,
  initialValues,
  type MyFormValues,
  validateFormValues,
} from './schemas';

export const MyFeatureCreatePage = () => {
  const navigate = useNavigate();
  const { mutateAsync: createMy, isPending: isCreating } = useCreateMyMutation();

  // Setup form with real-time custom + proto validation
  const form = useForm<MyFormValues>({
    resolver: createFormResolver({
      customValidator: validateFormValues,
      protoBuilder: buildProtoMessage,
      protoSchema: MyProtoSchema,
    }),
    defaultValues: initialValues,
    mode: 'onChange', // Real-time validation
  });

  // Submit handler - validation already done!
  const onSubmit = async (values: MyFormValues) => {
    try {
      // Build proto message (validation already done by resolver)
      const protoMessage = buildProtoMessage(values);

      // Submit to API
      await createMy(create(CreateMyRequestSchema, { my: protoMessage }));

      toast.success('Created successfully');
      navigate('/my-feature');
    } catch (err) {
      const connectError = err as ConnectError;
      toast.error(
        formatToastErrorMessageGRPC({
          error: connectError,
          action: 'create',
          entity: 'item',
        })
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Heading level={1}>Create Item</Heading>
        <Text variant="muted">Create a new item</Text>
      </div>

      <Form {...form}>
        <FormContainer
          className="w-full"
          layout="default"
          onSubmit={form.handleSubmit(onSubmit)}
          width="full"
        >
          <div className="space-y-4">
            {/* Name Field Example */}
            <Controller
              control={form.control}
              name="name"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel required>Name</FieldLabel>
                  <Input placeholder="Enter name" {...field} />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />

            {/* TODO: Add more form fields */}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => navigate('/my-feature')}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={!form.formState.isValid || isCreating} type="submit">
                {isCreating ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <Text as="span">Creating...</Text>
                  </div>
                ) : (
                  'Create'
                )}
              </Button>
            </div>
          </div>
        </FormContainer>
      </Form>
    </div>
  );
};
```

## schemas.test.ts Template

```typescript
import { create } from '@bufbuild/protobuf';
import { describe, expect, test } from 'vitest';
import { validateProtoMessage } from 'utils/form-validation';
import { MyProtoSchema } from 'protogen/my/api/v1/my_pb';

import { buildProtoMessage, initialValues, validateFormValues } from './schemas';

describe('Proto Validation', () => {
  test('should accept valid proto message', () => {
    const proto = create(MyProtoSchema, {
      name: 'Valid Name',
    });

    const result = validateProtoMessage(MyProtoSchema, proto);
    expect(result.valid).toBe(true);
  });

  test('should reject invalid proto message', () => {
    const proto = create(MyProtoSchema, {
      name: '', // Invalid: empty name
    });

    const result = validateProtoMessage(MyProtoSchema, proto);
    expect(result.valid).toBe(false);
  });
});

describe('Custom Validation', () => {
  test('should pass with valid values', () => {
    const values = {
      ...initialValues,
      name: 'Test',
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(true);
  });

  test('should reject invalid values', () => {
    const values = {
      ...initialValues,
      name: '', // Invalid
    };

    const result = validateFormValues(values);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeDefined();
  });

  // TODO: Add more custom validation tests
});

describe('Proto Builder', () => {
  test('should build valid proto message from form values', () => {
    const values = {
      ...initialValues,
      name: 'Test Name',
    };

    const proto = buildProtoMessage(values);
    expect(proto.name).toBe('Test Name');
  });
});
```

## Checklist

- [ ] Create `schemas.ts` with form types and validation
- [ ] Create `my-feature-page.tsx` with form component
- [ ] Create `schemas.test.ts` with tests
- [ ] Add route in `src/components/routes.tsx`
- [ ] Implement custom validation logic
- [ ] Implement proto builder function
- [ ] Add form fields with Controllers
- [ ] Test form validation in browser
- [ ] Verify proto validation works
- [ ] Ensure all tests pass

## Tips

1. **Keep form values flat** - Don't use nested proto structures in form state
2. **Custom validation for UX** - Provide real-time feedback for cross-field logic
3. **Proto validation for correctness** - Final validation before API submission
4. **Test both layers** - Test custom validation and proto validation separately
5. **Use TypeScript** - Let types guide your implementation
