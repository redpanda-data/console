import { Link } from '@tanstack/react-router';
import { Button } from 'components/redpanda-ui/components/button';
import { docsLinks } from 'utils/docs-links';
import { prettyMilliseconds } from 'utils/utils';

import {
  type License,
  License_Source,
  License_Type,
  type ListEnterpriseFeaturesResponse_Feature,
} from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import { api } from '../../state/backend-api';
import { AppFeatures } from '../../utils/env';

const Platform = {
  PLATFORM_REDPANDA: 1,
  PLATFORM_NON_REDPANDA: 2,
} as const;

export const MS_IN_DAY = 24 * 60 * 60 * 1000;

export const LICENSE_WEIGHT: Record<License_Type, number> = {
  [License_Type.UNSPECIFIED]: -1,
  [License_Type.COMMUNITY]: 1,
  [License_Type.TRIAL]: 2,
  [License_Type.ENTERPRISE]: 3,
};

/**
 * Checks if a license is a built-in trial license by examining its organization field.
 *
 * @param {License} license - The license object to check
 * @returns {boolean} Returns `true` if the license is a built-in trial (organization is 'Redpanda Built-In Evaluation Period'),
 * otherwise `false`
 */

export const isBakedInTrial = (license: License): boolean =>
  license.organization === 'Redpanda Built-In Evaluation Period';

/**
 * Checks if a list of enterprise features includes enabled features for authentication,
 * specifically 'sso' (Single Sign-On), 'rbac' (Reassign Partitions), or 'shadowlinks' (Shadow Links).
 *
 * @returns {boolean} - Returns `true` if an enabled feature with name 'sso', 'reassign partitions', or 'shadow links' is found, otherwise `false`.
 */
export const consoleHasEnterpriseFeature = (
  feature: 'SINGLE_SIGN_ON' | 'REASSIGN_PARTITIONS' | 'SHADOW_LINKS'
): boolean => AppFeatures[feature] ?? false;

/** True when Core has at least one enterprise feature enabled. */
export const coreHasEnterpriseFeatures = (features: ListEnterpriseFeaturesResponse_Feature[]): boolean =>
  features.some((feature) => feature.enabled);

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
  }
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
export const getExpirationDate = (license: License): Date => new Date(Number(license.expiresAt) * 1000);

/** Expiry as a long en-US date, pinned to that locale so it does not vary by environment. */
export const getPrettyExpirationDate = (license: License): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(getExpirationDate(license));

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

/** Time until expiry as a single coarse unit ("3 days"), or "License has expired". */
export const getPrettyTimeToExpiration = (license: License) => {
  const timeToExpiration = getMillisecondsToExpiration(license);

  if (timeToExpiration === -1) {
    return 'License has expired';
  }

  return prettyMilliseconds(Math.abs(timeToExpiration), { unitCount: 1, verbose: true, secondsDecimalDigits: 0 });
};

/** Display name for a licence type ("Redpanda Enterprise", "Trial", …), optionally prefixed with its source. */
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

  const date = new Date(Number(license.expiresAt) * 1000);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
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
 * Gets the license with the latest expiration time from a list of licenses.
 *
 * @param licenses - An array of License objects to evaluate.
 * @returns The license with the latest expiration time, or undefined if the array is empty.
 */
export const getLatestExpiringLicense = (licenses: License[]): License | undefined => {
  if (licenses.length === 0) {
    return;
  }

  return licenses.reduce((latest, current) => {
    const latestExpiration = Number(latest.expiresAt);
    const currentExpiration = Number(current.expiresAt);
    return currentExpiration > latestExpiration ? current : latest;
  });
};

/**
 * Groups licenses by type, one entry per type carrying the earliest expiry. A type with several
 * licences collapses to the bare type name (`Enterprise`); a type with one keeps its source in the
 * name (`Core Enterprise`). `expiresAt` is empty for licences that never expire.
 */
export const licensesToSimplifiedPreview = (
  licenses: License[]
): Array<{
  name: string;
  expiresAt: string;
  isExpired: boolean;
}> => {
  const groupedLicenses = licenses.groupBy((x) => x.type);

  return [...groupedLicenses.values()].map((licensesGroup) => {
    const [firstLicenseToExpire] = licensesGroup.orderBy((x) => Number(x.expiresAt));

    if (licensesGroup.length === 1) {
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

export const TRY_ENTERPRISE_LINK = 'https://redpanda.com/try-enterprise';
export const UPGRADE_LINK = 'https://redpanda.com/upgrade';

type EnterpriseLinkType = 'tryEnterprise' | 'upgrade';
export const resolveEnterpriseCTALink = (
  type: EnterpriseLinkType,
  cluster_uuid: string | undefined,
  isRedpanda: boolean
) => {
  const urls: Record<EnterpriseLinkType, string> = {
    tryEnterprise: TRY_ENTERPRISE_LINK,
    upgrade: UPGRADE_LINK,
  };

  const baseUrl = urls[type];
  const url = new URL(baseUrl);

  url.searchParams.append('cluster_id', cluster_uuid ?? '');
  url.searchParams.append('platform', `${isRedpanda ? Platform.PLATFORM_REDPANDA : Platform.PLATFORM_NON_REDPANDA}`);

  return url.toString();
};

export const getEnterpriseCTALink = (type: EnterpriseLinkType): string =>
  resolveEnterpriseCTALink(type, api.clusterOverview?.kafka?.clusterId, api.isRedpanda);

export const DISABLE_SSO_DOCS_LINK = docsLinks.selfManaged.consoleConfig;

export const ENTERPRISE_FEATURES_DOCS_LINK = docsLinks.selfManaged.enterpriseEdition;

export const SERVERLESS_LINK = 'https://www.redpanda.com/product/serverless';

export const UploadLicenseButton = () =>
  api.isAdminApiConfigured ? (
    <Button as={Link} size="sm" to="/upload-license" variant="outline">
      Upload license
    </Button>
  ) : null;

export const UpgradeButton = () => (
  <Button
    as="a"
    className="no-underline"
    href={getEnterpriseCTALink('upgrade')}
    rel="noopener noreferrer"
    size="sm"
    target="_blank"
    variant="outline"
  >
    Upgrade
  </Button>
);

export const RegisterButton = ({ onRegisterModalOpen }: { onRegisterModalOpen: () => void }) =>
  api.isAdminApiConfigured ? (
    <Button onClick={onRegisterModalOpen} size="sm" variant="outline">
      Register
    </Button>
  ) : (
    <Button
      as="a"
      href={getEnterpriseCTALink('tryEnterprise')}
      rel="noopener noreferrer"
      size="sm"
      target="_blank"
      variant="outline"
    >
      Register
    </Button>
  );
