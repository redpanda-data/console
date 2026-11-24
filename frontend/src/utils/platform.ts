const MAC_OS_USER_AGENT_REGEX = /Mac/iu;
function testUserAgent(re: RegExp) {
  if (typeof navigator === 'undefined' || !navigator.userAgent) {
    return false;
  }
  return re.test(navigator.userAgent);
}

/** Returns true if the user is on macOS. */
export function isMacOS() {
  return testUserAgent(MAC_OS_USER_AGENT_REGEX);
}
