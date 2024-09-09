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
export const licenseIsExpired = (license: License): boolean => license.type !== License_Type.COMMUNITY && new Date(Number(license.expiresAt) * 1000) < new Date()

/**
 * Checks if a license is about to expire within a specified number of days.
 * The function returns `true` if the license is set to expire within the offset period from the current date.
 *
 * @param {License} license - The license object to check.
 * @param {number} [offsetInDays=30] - The number of days to check before the license expires. Defaults to 30 days.
 * @returns {boolean} - Returns `true` if the license will expire within the specified number of days, otherwise `false`.
 */
export const licenseSoonToExpire = (license: License, offsetInDays: number = 30): boolean => {
    const millisecondsInADay = 24 * 60 * 60 * 1000; // Number of milliseconds in a day
    const offsetInMilliseconds = offsetInDays * millisecondsInADay;

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

    return prettyMilliseconds(Math.abs(timeToExpiration), {unitCount: 2, verbose: true, secondsDecimalDigits: 0})
}

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
    const licenseType = ({
        [License_Type.COMMUNITY]: 'Community',
        [License_Type.UNSPECIFIED]: 'Unspecified',
        [License_Type.ENTERPRISE]: 'Enterprise',
        [License_Type.TRIAL]: 'Trial',
    })[license.type];

    const sourceType = ({
        [License_Source.UNSPECIFIED]: 'Unspecified',
        [License_Source.REDPANDA_CONSOLE]: 'Console',
        [License_Source.REDPANDA_CORE]: 'Core',
    })[license.source]

    return showSource ? `${sourceType} ${licenseType}` : licenseType
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
export const licenseCanExpire = (license: License): boolean => license.type !== License_Type.COMMUNITY
