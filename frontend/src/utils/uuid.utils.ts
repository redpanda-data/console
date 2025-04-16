const UUIDV4_REGEX = new RegExp(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

/**
 * Determines whether a given string is a valid UUIDv4.
 *
 * @param string - The string to test.
 * @returns `true` if the string is a valid UUIDv4; otherwise, `false`.
 */
export const isUuid = (string: string) => UUIDV4_REGEX.test(string);
