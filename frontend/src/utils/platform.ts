const MAC_OS_USER_AGENT_REGEX = /Mac/i;
/**
 * Test the user agent string against a regex pattern.
 * Mirrors the approach used by React Spectrum (@react-aria/utils) which
 * moved from the deprecated `navigator.platform` to `navigator.userAgent`.
 */
function testUserAgent(re: RegExp): boolean {
  if (typeof navigator === 'undefined' || !navigator.userAgent) {
    return false;
  }
  return re.test(navigator.userAgent);
}

/** Returns true if the user is on macOS. */
export function isMacOS(): boolean {
  return testUserAgent(MAC_OS_USER_AGENT_REGEX);
}
