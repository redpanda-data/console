import { License, License_Type } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';

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
 * @param {string} license.expiresAt - The Unix timestamp (in seconds) when the license expires.
 * @param {number} [offsetInDays=30] - The number of days to check before the license expires. Defaults to 30 days.
 * @returns {boolean} - Returns `true` if the license will expire within the specified number of days, otherwise `false`.
 */
export const licenseSoonToExpire = (license: License, offsetInDays: number = 30): boolean => {
    const currentDate = new Date();
    const offsetDate = new Date();

    // Set the offset date to the current date plus the offset in days
    offsetDate.setDate(currentDate.getDate() + offsetInDays);

    // Convert the license expiration date from seconds to milliseconds
    const expiresAtDate = new Date(Number(license.expiresAt) * 1000);

    // Check if the license expires within the offset period
    return expiresAtDate < offsetDate && expiresAtDate > currentDate;
};
export const prettyLicenseType = (type: License_Type): string => ({
    [License_Type.COMMUNITY]: 'Redpanda Community',
    [License_Type.UNSPECIFIED]: 'Unspecified',
    [License_Type.ENTERPRISE]: 'Redpanda Enterprise',
    [License_Type.TRIAL]: 'Trial',
})[type];

export const prettyExpirationDate = (license: License): string => {
    if (license.type===License_Type.COMMUNITY) {
        return '';
    }

    return new Date(Number(license.expiresAt) * 1000).toLocaleDateString();
};
