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

interface BaseProtoFormFieldProps {
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
}

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
    const indicators = [];
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
    <FormControl isRequired={isRequired} isInvalid={!!error}>
      <FormLabel>{label}</FormLabel>
      {description && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {description}
        </Text>
      )}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        isReadOnly={isReadOnly}
        opacity={isReadOnly ? 0.6 : 1}
        cursor={isReadOnly ? 'not-allowed' : 'text'}
        {...inputProps}
      />
      {indicators.length > 0 && (
        <Text fontSize="xs" color="gray.500" mt={1}>
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
    <FormControl isRequired={isRequired} isInvalid={!!error}>
      <FormLabel>{label}</FormLabel>
      {description && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {description}
        </Text>
      )}
      <Textarea
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        isReadOnly={isReadOnly}
        opacity={isReadOnly ? 0.6 : 1}
        cursor={isReadOnly ? 'not-allowed' : 'text'}
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
}) => {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" color="gray.700" mb={1}>
        {label}
      </Text>
      {description && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {description}
        </Text>
      )}
      <Box p={3} bg="gray.50" borderRadius="md" border="1px solid" borderColor="gray.200">
        <Text fontSize="sm" color="gray.900">
          {value || (
            <Text as="span" color="gray.400" fontStyle="italic">
              Not set
            </Text>
          )}
        </Text>
      </Box>
    </Box>
  );
};
