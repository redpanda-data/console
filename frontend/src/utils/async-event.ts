/** Adapt work to synchronous event APIs while giving every rejection an explicit owner.
 * Do not use where the caller awaits completion; return/await the action directly there.
 */
export function asyncEvent<Args extends unknown[]>(
  action: (...args: Args) => unknown,
  reportError: (error: unknown) => void
): (...args: Args) => void {
  return (...args) => {
    try {
      Promise.resolve(action(...args)).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  };
}
