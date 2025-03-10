import { Button, Link } from '@redpanda-data/ui';
import { Link as ReactRouterLink } from 'react-router-dom';
import {
  type License,
  License_Source,
  License_Type,
  type ListEnterpriseFeaturesResponse_Feature,
} from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backendApi';
import { AppFeatures } from '../../utils/env';
import { prettyMilliseconds } from '../../utils/utils';

enum Platform {
  PLATFORM_REDPANDA = 1,
  PLATFORM_NON_REDPANDA = 2,
}

export const MS_IN_DAY = 24 * 60 * 60 * 1000;

export const LICENSE_WEIGHT: Record<License_Type, number> = {
  [License_Type.UNSPECIFIED]: -1,
  [License_Type.COMMUNITY]: 1,
  [License_Type.TRIAL]: 2,
  [License_Type.ENTERPRISE]: 3,
};

/**
 * Checks if a list of enterprise features includes enabled features for authentication,
 * specifically 'sso' (Single Sign-On) or 'rbac' (Reassign Partitions).
 *
 * @returns {boolean} - Returns `true` if an enabled feature with name 'sso' or 'reassign partitions' is found, otherwise `false`.
 */
export const consoleHasEnterpriseFeature = (feature: 'SINGLE_SIGN_ON' | 'REASSIGN_PARTITIONS'): boolean => {
  return AppFeatures[feature] ?? false;
};

/**
 * Determines if the CORE system includes any enabled enterprise features.
 *
 * This function checks a list of enterprise features and returns `true` if at least one feature is enabled,
 * otherwise `false`.
 *
 * @param features - An array of `ListEnterpriseFeaturesResponse_Feature` objects representing the
 * enterprise features and their enabled statuses.
 *
 * @returns `true` if at least one enterprise feature is enabled; otherwise, `false`.
 */
export const coreHasEnterpriseFeatures = (features: ListEnterpriseFeaturesResponse_Feature[]): boolean => {
  return features.some((feature) => feature.enabled);
};

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

  const timeToExpiration = getMillisecondsToExpiration(license);

  // Check if the license expires within the offset period
  return timeToExpiration > 0 && timeToExpiration <= offsetInMilliseconds;
};

/**
 * Calculates the expiration date of a license.
 *
 * @param {License} license - The license object containing the expiration timestamp.
 * @returns {Date} The expiration date as a JavaScript Date object.
 */
export const getExpirationDate = (license: License): Date => {
  return new Date(Number(license.expiresAt) * 1000);
};

/**
 * Formats the expiration date of a given license into a user-friendly string format.
 *
 * @param license - The license object containing the expiration date information.
 * @returns A string representing the expiration date in the format MM/DD/YYYY.
 *
 * @remarks
 * This function utilizes `Intl.DateTimeFormat` to ensure consistent date formatting
 * regardless of the user's local environment. It formats the date using the 'en-US' locale
 * with two-digit month, day, and four-digit year.
 */
export const getPrettyExpirationDate = (license: License): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(getExpirationDate(license));
};

/**
 * Calculates the time remaining until a license expires.
 *
 * @param {License} license - The license object containing the expiration date.
 * @param {string} license.expiresAt - The Unix timestamp (in seconds) when the license expires.
 * @returns {number} - The time remaining until expiration in milliseconds. If the license has already expired, returns 0.
 */
export const getMillisecondsToExpiration = (license: License): number => {
  const expirationDate = getExpirationDate(license);
  const currentTime = new Date();

  const timeRemaining = expirationDate.getTime() - currentTime.getTime();

  return timeRemaining > 0 ? timeRemaining : -1;
};

/**
 * Computes a human-readable representation of the time remaining until a license expires.
 *
 * This function takes a `License` object, calculates the time until expiration in milliseconds,
 * and formats it into a user-friendly string. If the license has already expired, it returns
 * a corresponding message.
 *
 * @param license - The `License` object containing expiration information.
 *
 * @returns A string representation of the time until expiration. For example:
 * - If the license has expired: `"License has expired"`
 * - If the license is still valid: `"3 days"` or `"4 hours"`, formatted using `prettyMilliseconds`.
 *
 * @remarks
 * - The function internally uses `getMillisecondsToExpiration` to determine the raw time until expiration.
 * - The `prettyMilliseconds` library is used to format the result in a human-readable way.
 * - The result is truncated to 1 unit of time (e.g., `1 day`), with no decimal places for seconds.
 */
export const getPrettyTimeToExpiration = (license: License) => {
  const timeToExpiration = getMillisecondsToExpiration(license);

  if (timeToExpiration === -1) {
    return 'License has expired';
  }

  return prettyMilliseconds(Math.abs(timeToExpiration), { unitCount: 1, verbose: true, secondsDecimalDigits: 0 });
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
 * Determines whether the given license grants access to enterprise-level features.
 *
 * This function checks if the license type is either `TRIAL` or `ENTERPRISE`,
 * as both license types provide access to enterprise features.
 *
 * @param license - The license object to evaluate.
 * @returns `true` if the license type is `TRIAL` or `ENTERPRISE`, otherwise `false`.
 */
export const isLicenseWithEnterpriseAccess = (license: License): boolean =>
  license.type === License_Type.TRIAL || license.type === License_Type.ENTERPRISE;

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
  isExpired: boolean;
}> => {
  const groupedLicenses = licenses.groupBy((x) => x.type);

  return [...groupedLicenses.values()].map((licenses) => {
    const [firstLicenseToExpire] = licenses.orderBy((x) => Number(x.expiresAt));

    if (licenses.length === 1) {
      return {
        name: prettyLicenseType(firstLicenseToExpire, true),
        expiresAt: licenseCanExpire(firstLicenseToExpire) ? prettyExpirationDate(firstLicenseToExpire) : '',
        isExpired: getMillisecondsToExpiration(firstLicenseToExpire) === -1,
      };
    }
    return {
      name: prettyLicenseType(firstLicenseToExpire, false),
      expiresAt: licenseCanExpire(firstLicenseToExpire) ? prettyExpirationDate(firstLicenseToExpire) : '',
      isExpired: getMillisecondsToExpiration(firstLicenseToExpire) === -1,
    };
  });
};

type EnterpriseLinkType = 'tryEnterprise' | 'upgrade';
export const resolveEnterpriseCTALink = (
  type: EnterpriseLinkType,
  cluster_uuid: string | undefined,
  isRedpanda: boolean,
) => {
  const urls: Record<EnterpriseLinkType, string> = {
    tryEnterprise: 'https://redpanda.com/try-enterprise',
    upgrade: 'https://redpanda.com/upgrade',
  };

  const baseUrl = urls[type];
  const url = new URL(baseUrl);

  url.searchParams.append('cluster_id', cluster_uuid ?? '');
  url.searchParams.append('platform', `${isRedpanda ? Platform.PLATFORM_REDPANDA : Platform.PLATFORM_NON_REDPANDA}`);

  return url.toString();
};

export const getEnterpriseCTALink = (type: EnterpriseLinkType): string => {
  return resolveEnterpriseCTALink(type, api.clusterOverview?.kafka.clusterId, api.isRedpanda);
};

export const DISABLE_SSO_DOCS_LINK = 'https://docs.redpanda.com/current/console/config/configure-console/';

export const ENTERPRISE_FEATURES_DOCS_LINK =
  'https://docs.redpanda.com/current/get-started/licenses/#redpanda-enterprise-edition';

export const UploadLicenseButton = () =>
  api.isAdminApiConfigured ? (
    <Button variant="outline" size="sm" as={ReactRouterLink} to="/admin/upload-license">
      Upload license
    </Button>
  ) : null;
export const UpgradeButton = () => (
  <Button
    variant="outline"
    size="sm"
    as={Link}
    target="_blank"
    href={getEnterpriseCTALink('upgrade')}
    style={{
      textDecoration: 'none',
    }}
  >
    Upgrade
  </Button>
);
