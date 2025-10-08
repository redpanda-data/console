/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { DescMessage } from '@bufbuild/protobuf';
import {
  Box,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Input,
  type InputProps,
  Text,
  Textarea,
  type TextareaProps,
} from '@redpanda-data/ui';

import { isFieldEditable, isFieldImmutable, isFieldOutputOnly, isFieldRequired } from '../../utils/protobuf-reflection';

type BaseProtoFormFieldProps = {
  /** The protobuf message schema to analyze */
  messageSchema: DescMessage;
  /** The field name as it appears in the protobuf schema (e.g., 'display_name') */
  fieldName: string;
  /** The display label for the field */
  label: string;
  /** Current field value */
  value: string | number;
  /** Change handler */
  onChange: (value: string | number) => void;
  /** Optional error message to display */
  error?: string;
  /** Additional help text or description */
  description?: string;
  /** Override the automatic editability detection */
  forceReadOnly?: boolean;
  /** Override the automatic required detection */
  forceRequired?: boolean;
};

interface ProtoInputFieldProps extends BaseProtoFormFieldProps {
  /** Input-specific props */
  inputProps?: Omit<InputProps, 'value' | 'onChange' | 'isRequired' | 'isReadOnly' | 'isInvalid'>;
}

interface ProtoTextareaFieldProps extends BaseProtoFormFieldProps {
  /** Textarea-specific props */
  textareaProps?: Omit<TextareaProps, 'value' | 'onChange' | 'isRequired' | 'isReadOnly' | 'isInvalid'>;
}

/**
 * Form input field that automatically respects protobuf field behaviors
 */
export const ProtoInputField = ({
  messageSchema,
  fieldName,
  label,
  value,
  onChange,
  error,
  description,
  forceReadOnly = false,
  forceRequired = false,
  inputProps = {},
}: ProtoInputFieldProps) => {
  const isRequired = forceRequired || isFieldRequired(messageSchema, fieldName);
  const isEditable = !forceReadOnly && isFieldEditable(messageSchema, fieldName);
  const isReadOnly =
    !isEditable || isFieldOutputOnly(messageSchema, fieldName) || isFieldImmutable(messageSchema, fieldName);

  // Convert behavior flags to user-friendly indicators
  const getFieldIndicators = () => {
    const indicators: string[] = [];
    if (isFieldOutputOnly(messageSchema, fieldName)) {
      indicators.push('Computed by system');
    }
    if (isFieldImmutable(messageSchema, fieldName)) {
      indicators.push('Cannot be changed after creation');
    }
    return indicators;
  };

  const indicators = getFieldIndicators();

  return (
    <FormControl isInvalid={!!error} isRequired={isRequired}>
      <FormLabel>{label}</FormLabel>
      {description && (
        <Text color="gray.500" fontSize="sm" mb={2}>
          {description}
        </Text>
      )}
      <Input
        cursor={isReadOnly ? 'not-allowed' : 'text'}
        isReadOnly={isReadOnly}
        onChange={(e) => onChange(e.target.value)}
        opacity={isReadOnly ? 0.6 : 1}
        value={value}
        {...inputProps}
      />
      {indicators.length > 0 && (
        <Text color="gray.500" fontSize="xs" mt={1}>
          {indicators.join(' • ')}
        </Text>
      )}
      <FormErrorMessage>{error}</FormErrorMessage>
    </FormControl>
  );
};

/**
 * Form textarea field that automatically respects protobuf field behaviors
 */
export const ProtoTextareaField = ({
  messageSchema,
  fieldName,
  label,
  value,
  onChange,
  error,
  description,
  forceReadOnly = false,
  forceRequired = false,
  textareaProps = {},
}: ProtoTextareaFieldProps) => {
  const isRequired = forceRequired || isFieldRequired(messageSchema, fieldName);
  const isEditable = !forceReadOnly && isFieldEditable(messageSchema, fieldName);
  const isReadOnly =
    !isEditable || isFieldOutputOnly(messageSchema, fieldName) || isFieldImmutable(messageSchema, fieldName);

  return (
    <FormControl isInvalid={!!error} isRequired={isRequired}>
      <FormLabel>{label}</FormLabel>
      {description && (
        <Text color="gray.500" fontSize="sm" mb={2}>
          {description}
        </Text>
      )}
      <Textarea
        cursor={isReadOnly ? 'not-allowed' : 'text'}
        isReadOnly={isReadOnly}
        onChange={(e) => onChange(e.target.value)}
        opacity={isReadOnly ? 0.6 : 1}
        value={value as string}
        {...textareaProps}
      />
      <FormErrorMessage>{error}</FormErrorMessage>
    </FormControl>
  );
};

/**
 * Read-only field for displaying non-editable values with proper styling
 */
export const ProtoDisplayField = ({
  label,
  value,
  description,
}: {
  messageSchema?: DescMessage;
  fieldName?: string;
  label: string;
  value: string | number;
  description?: string;
}) => (
  <Box>
    <Text color="gray.700" fontSize="sm" fontWeight="medium" mb={1}>
      {label}
    </Text>
    {description && (
      <Text color="gray.500" fontSize="sm" mb={2}>
        {description}
      </Text>
    )}
    <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="md" p={3}>
      <Text color="gray.900" fontSize="sm">
        {value || (
          <Text as="span" color="gray.400" fontStyle="italic">
            Not set
          </Text>
        )}
      </Text>
    </Box>
  </Box>
);
