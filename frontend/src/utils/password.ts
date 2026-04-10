/**
 * Generates a random password of the given length using cryptographically
 * secure random values.
 */
export function generatePassword(length: number, allowSpecialChars: boolean): string {
  if (length <= 0) {
    return '';
  }

  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = lowercase.toUpperCase();
  const numbers = '0123456789';
  const special = '.,&_+|[]/-()';

  const alphabet = lowercase + uppercase + numbers + (allowSpecialChars ? special : '');

  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);

  return Array.from(randomValues, (n) => alphabet[n % alphabet.length]).join('');
}
