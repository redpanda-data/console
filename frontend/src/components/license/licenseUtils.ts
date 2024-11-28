import { License, License_Source, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { prettyMilliseconds } from '../../utils/utils';

/**
 * Checks if a license is expired.
 * A license is considered expired if its type is not `COMMUNITY` and the expiration date is before the current date.
 *
 * @param {License} license - The license object to check.
 * @param {string} license.expiresAt - The Unix timestamp (in seconds) when the license expires.
 * @param {string} license.type - The type of the license (e.g., `COMMUNITY`).
 * @returns {boolean} - Returns `true` if the license is expired, otherwise `false`.
 */
export const licenseIsExpired = (license: License): boolean =>
  license.type !== License_Type.COMMUNITY && new Date(Number(license.expiresAt) * 1000) < new Date();

/**
 * Checks if a license is about to expire within a specified number of days.
 * The function returns `true` if the license is set to expire within the offset period from the current date.
 *
 * @param {License} license - The license object to check.
 * @param {Partial<Record<License_Type, number>>} [offsetInDays] - An optional mapping of license types
 * to the number of days before expiration to consider for each license type. Defaults to 15 days
 * for `TRIAL` licenses and 30 days for `ENTERPRISE` licenses.
 * @returns {boolean} - Returns `true` if the license will expire within the specified number of days, otherwise `false`.
 */
export const licenseSoonToExpire = (
  license: License,
  offsetInDays: Partial<Record<License_Type, number>> = {
    [License_Type.TRIAL]: 15,
    [License_Type.ENTERPRISE]: 30,
  },
): boolean => {
  const daysToExpire: number | undefined = offsetInDays[license.type];

  if (daysToExpire === undefined) {
    return false;
  }

  const millisecondsInADay = 24 * 60 * 60 * 1000; // Number of milliseconds in a day
  const offsetInMilliseconds = daysToExpire * millisecondsInADay;

  const timeToExpiration = getTimeToExpiration(license);

  // Check if the license expires within the offset period
  return timeToExpiration > 0 && timeToExpiration <= offsetInMilliseconds;
};

/**
 * Calculates the time remaining until a license expires.
 *
 * @param {License} license - The license object containing the expiration date.
 * @param {string} license.expiresAt - The Unix timestamp (in seconds) when the license expires.
 * @returns {number} - The time remaining until expiration in milliseconds. If the license has already expired, returns 0.
 */
const getTimeToExpiration = (license: License): number => {
  const expirationDate = new Date(Number(license.expiresAt) * 1000);
  const currentTime = new Date();

  const timeRemaining = expirationDate.getTime() - currentTime.getTime();

  return timeRemaining > 0 ? timeRemaining : 0;
};

export const getPrettyTimeToExpiration = (license: License) => {
  const timeToExpiration = getTimeToExpiration(license);

  if (timeToExpiration === 0) {
    return 'License has expired';
  }

  return prettyMilliseconds(Math.abs(timeToExpiration), { unitCount: 2, verbose: true, secondsDecimalDigits: 0 });
};

/**
 * Returns a user-friendly string representing the type of a license.
 *
 * @param {License} license - The license object containing the expiration date and type.
 * @param {boolean} showSource - Determines whether to show sourae type of a license.
 * @returns {string} - A pretty, human-readable string for the license type.
 *                     - 'Redpanda Community' for `COMMUNITY`
 *                     - 'Unspecified' for `UNSPECIFIED`
 *                     - 'Redpanda Enterprise' for `ENTERPRISE`
 *                     - 'Trial' for `TRIAL`
 */
export const prettyLicenseType = (license: License, showSource = false): string => {
  const licenseType = {
    [License_Type.COMMUNITY]: 'Community',
    [License_Type.UNSPECIFIED]: 'Unspecified',
    [License_Type.ENTERPRISE]: 'Enterprise',
    [License_Type.TRIAL]: 'Trial',
  }[license.type];

  const sourceType = {
    [License_Source.UNSPECIFIED]: 'Unspecified',
    [License_Source.REDPANDA_CONSOLE]: 'Console',
    [License_Source.REDPANDA_CORE]: 'Redpanda',
  }[license.source];

  return showSource ? `${sourceType} ${licenseType}` : licenseType;
};

/**
 * Returns a formatted expiration date string for a license.
 * If the license type is `COMMUNITY`, it returns an empty string since there is no expiration date.
 *
 * @param {License} license - The license object containing the expiration date and type.
 * @param {string} license.expiresAt - The Unix timestamp (in seconds) when the license expires.
 * @param {License_Type} license.type - The type of the license.
 * @returns {string} - A formatted expiration date string in the user's locale, or an empty string if the license is of type `COMMUNITY`.
 */
export const prettyExpirationDate = (license: License): string => {
  if (!licenseCanExpire(license)) {
    return '';
  }

  return new Date(Number(license.expiresAt) * 1000).toLocaleDateString();
};

/**
 * Determines whether a license is of a type that can expire.
 * Community licenses are considered non-expiring.
 *
 * @param {License} license - The license object to check.
 * @param {License_Type} license.type - The type of the license.
 * @returns {boolean} - Returns `true` if the license type can expire, otherwise `false`.
 */
export const licenseCanExpire = (license: License): boolean => license.type !== License_Type.COMMUNITY;

/**
 * Simplifies a list of licenses by grouping them based on their type and returning a simplified preview of each type.
 *
 * - If there are multiple licenses of the same type, it displays the type with the expiration date of the license that expires first.
 * - If there is only one license of a specific type, it includes the detailed version of the license (with its name and source) and its expiration date.
 *
 * The function returns an array of objects where each object represents a license type with the earliest expiration date.
 *
 * @param licenses - An array of `License` objects to be simplified.
 *
 * @returns An array of objects with the following properties:
 * - `name`: The license type, simplified if there are multiple licenses of that type, or detailed if there's only one license.
 * - `expiresAt`: The expiration date of the earliest expiring license for that type, represented as a string or an empty string if the license doesn't expire.
 *
 * @example
 * ```typescript
 * const licenses = {
 *   "licenses": [
 *     {
 *       "source": "SOURCE_REDPANDA_CONSOLE",
 *       "type": "TYPE_ENTERPRISE",
 *       "expiresAt": "2041321065"
 *     },
 *     {
 *       "source": "SOURCE_REDPANDA_CORE",
 *       "type": "TYPE_ENTERPRISE",
 *       "expiresAt": "4813575088"
 *     }
 *   ]
 * };
 *
 * const simplifiedPreview = licensesToSimplifiedPreview(licenses.licenses);
 *
 * // Output:
 * // [
 * //   { name: 'Enterprise', expiresAt: '...' }
 * // ]
 * ```
 *
 * @example
 * ```typescript
 * const licenses = {
 *   "licenses": [
 *     {
 *       "source": "SOURCE_REDPANDA_CONSOLE",
 *       "type": "TYPE_COMMUNITY",
 *       "expiresAt": "2041321065"
 *     },
 *     {
 *       "source": "SOURCE_REDPANDA_CORE",
 *       "type": "TYPE_ENTERPRISE",
 *       "expiresAt": "4813575088"
 *     }
 *   ]
 * };
 *
 * const simplifiedPreview = licensesToSimplifiedPreview(licenses.licenses);
 *
 * // Output:
 * // [
 * //   { name: 'Console Community', expiresAt: '' },
 * //   { name: 'Core Enterprise', expiresAt: '...' }
 * // ]
 * ```
 */
export const licensesToSimplifiedPreview = (
  licenses: License[],
): Array<{
  name: string;
  expiresAt: string;
}> => {
  const groupedLicenses = licenses.groupBy((x) => x.type);

  return [...groupedLicenses.values()].map((licenses) => {
    const [firstLicenseToExpire] = licenses.orderBy((x) => Number(x.expiresAt));

    if (licenses.length === 1) {
      return {
        name: prettyLicenseType(firstLicenseToExpire, true),
        expiresAt: licenseCanExpire(firstLicenseToExpire) ? prettyExpirationDate(firstLicenseToExpire) : '',
      };
    }
    return {
      name: prettyLicenseType(firstLicenseToExpire, false),
      expiresAt: licenseCanExpire(firstLicenseToExpire) ? prettyExpirationDate(firstLicenseToExpire) : '',
    };
  });
};
