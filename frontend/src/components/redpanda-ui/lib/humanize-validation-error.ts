// Converts raw protovalidate error messages into human-readable messages.
// Acts as a safety net for standard buf.validate constraints that cannot carry
// custom messages. Proto-level CEL expressions with custom messages take
// priority — this utility only fires for generic fallback messages.

const REGEX_ERROR_PATTERN = /regex pattern\s*`([^`]+)`/;
const MIN_LEN_PATTERN = /^value length must be at least (\d+)/;
const MAX_LEN_PATTERN = /^value length must be at most (\d+)/;
const MIN_ITEMS_PATTERN = /^value must contain at least (\d+)/;
const MAX_ITEMS_PATTERN = /^value must contain at most (\d+)/;
const GTE_PATTERN = /^value must be greater than or equal to ([\d.]+)/;
const LTE_PATTERN = /^value must be less than or equal to ([\d.]+)/;
const GT_PATTERN = /^value must be greater than ([\d.]+)/;
const LT_PATTERN = /^value must be less than ([\d.]+)/;

interface PatternDescription {
  description: string;
  example: string;
}

const KNOWN_PATTERNS: Record<string, PatternDescription> = {
  '^$|^[A-Z][A-Z0-9_]*$': {
    description: 'Must be empty or UPPER_SNAKE_CASE (uppercase letters, digits, and underscores)',
    example: 'MY_API_KEY',
  },
  '^[A-Z][A-Z0-9_]*$': {
    description: 'Must be UPPER_SNAKE_CASE (start with a letter, then uppercase letters, digits, and underscores)',
    example: 'AWS_ACCESS_KEY_ID',
  },
  '^[a-z][a-z0-9-]*$': {
    description: 'Must be lowercase letters, digits, and hyphens (start with a letter)',
    example: 'my-resource-name',
  },
  '^[a-z0-9][a-z0-9-]*$': {
    description: 'Must be lowercase letters, digits, and hyphens (start with a letter or digit)',
    example: 'my-resource-1',
  },
  // Match the URL pattern with or without a trailing `$` anchor — both
  // appear in protovalidate output depending on how the rule was authored.
  '^https?://.+': {
    description: 'Must be a valid URL starting with http:// or https://',
    example: 'https://example.com',
  },
  '^https?://.+$': {
    description: 'Must be a valid URL starting with http:// or https://',
    example: 'https://example.com',
  },
};

/** Known generic protovalidate messages that should be replaced by custom CEL messages when available. */
const GENERIC_MESSAGES = new Set(['value is required', 'exactly one field is required in oneof']);

/**
 * Returns true if the message is a generic protovalidate constraint message
 * (i.e., not a custom CEL message). Used by the resolver to prefer custom
 * messages over generic ones when a field has multiple validation errors.
 */
export function isGenericValidationMessage(message: string): boolean {
  if (GENERIC_MESSAGES.has(message)) {
    return true;
  }
  if (MIN_LEN_PATTERN.test(message) || MAX_LEN_PATTERN.test(message)) {
    return true;
  }
  if (REGEX_ERROR_PATTERN.test(message)) {
    return true;
  }
  if (
    MIN_ITEMS_PATTERN.test(message) ||
    MAX_ITEMS_PATTERN.test(message) ||
    GTE_PATTERN.test(message) ||
    LTE_PATTERN.test(message) ||
    GT_PATTERN.test(message) ||
    LT_PATTERN.test(message)
  ) {
    return true;
  }
  return false;
}

function humanizeLengthConstraint(message: string): string | undefined {
  const minLenMatch = MIN_LEN_PATTERN.exec(message);
  if (minLenMatch?.[1] !== undefined) {
    return minLenMatch[1] === '1' ? 'This field is required.' : `Must be at least ${minLenMatch[1]} characters.`;
  }
  const maxLenMatch = MAX_LEN_PATTERN.exec(message);
  if (maxLenMatch?.[1] !== undefined) {
    return `Must be at most ${maxLenMatch[1]} characters.`;
  }
  return undefined;
}

function humanizeItemConstraint(message: string): string | undefined {
  const minItemsMatch = MIN_ITEMS_PATTERN.exec(message);
  if (minItemsMatch?.[1] !== undefined) {
    return minItemsMatch[1] === '1'
      ? 'At least one item is required.'
      : `At least ${minItemsMatch[1]} items are required.`;
  }
  const maxItemsMatch = MAX_ITEMS_PATTERN.exec(message);
  if (maxItemsMatch?.[1] !== undefined) {
    return maxItemsMatch[1] === '1' ? 'At most one item is allowed.' : `At most ${maxItemsMatch[1]} items are allowed.`;
  }
  return undefined;
}

function humanizeNumericBound(message: string): string | undefined {
  const gteMatch = GTE_PATTERN.exec(message);
  if (gteMatch?.[1] !== undefined) {
    return `Must be ${gteMatch[1]} or greater.`;
  }
  const lteMatch = LTE_PATTERN.exec(message);
  if (lteMatch?.[1] !== undefined) {
    return `Must be ${lteMatch[1]} or less.`;
  }
  const gtMatch = GT_PATTERN.exec(message);
  if (gtMatch?.[1] !== undefined) {
    return `Must be greater than ${gtMatch[1]}.`;
  }
  const ltMatch = LT_PATTERN.exec(message);
  if (ltMatch?.[1] !== undefined) {
    return `Must be less than ${ltMatch[1]}.`;
  }
  return undefined;
}

function humanizeRegexError(message: string): string | undefined {
  const regexMatch = REGEX_ERROR_PATTERN.exec(message);
  if (regexMatch?.[1] === undefined) {
    return;
  }
  const known = KNOWN_PATTERNS[regexMatch[1]];
  return known === undefined ? message : `${known.description}. Example: ${known.example}`;
}

/**
 * Replace raw protovalidate error messages with human-readable descriptions.
 * Returns the original message if it's already a custom CEL message.
 */
export function humanizeValidationError(message: string): string {
  if (message === 'value is required') {
    return 'This field is required.';
  }
  if (message === 'exactly one field is required in oneof') {
    return 'Select an option.';
  }

  return (
    humanizeLengthConstraint(message) ??
    humanizeItemConstraint(message) ??
    humanizeNumericBound(message) ??
    humanizeRegexError(message) ??
    message
  );
}
