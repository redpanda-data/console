import {
  License,
  License_Source,
  License_Type,
  type ListEnterpriseFeaturesResponse_Feature,
} from '../../protogen/redpanda/api/console/v1alpha1/license_pb';
import {
  coreHasEnterpriseFeatures,
  getPrettyTimeToExpiration,
  licenseIsExpired,
  licenseSoonToExpire,
  licensesToSimplifiedPreview,
  prettyExpirationDate,
  prettyLicenseType,
  resolveEnterpriseCTALink,
} from './licenseUtils';
import '../../utils/arrayExtensions';

describe('licenseUtils', () => {
  const origDate = Date.prototype.toLocaleDateString;

  beforeAll(() => {
    Object.defineProperty(Date.prototype, 'toLocaleDateString', {
      value() {
        return origDate.call(this, 'en-US');
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(Date.prototype, 'toLocaleDateString', {
      value() {
        return origDate.call(this);
      },
    });
  });

  const mockLicenseCommunity: License = new License({
    type: License_Type.COMMUNITY,
    expiresAt: BigInt(20413210650),
    source: License_Source.REDPANDA_CONSOLE,
  });

  const mockLicenseEnterprise: License = new License({
    type: License_Type.ENTERPRISE,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30), // expires in 30 days
    source: License_Source.REDPANDA_CORE,
  });

  const expiredLicense: License = new License({
    type: License_Type.ENTERPRISE,
    expiresAt: BigInt(Math.floor(Date.now() / 1000) - 60 * 60 * 24), // expired yesterday
    source: License_Source.REDPANDA_CONSOLE,
  });

  describe('coreHasEnterpriseFeatures', () => {
    test('should return true when at least one feature is enabled', () => {
      const features: ListEnterpriseFeaturesResponse_Feature[] = [
        { name: 'rbac', enabled: true },
        { name: 'datalake_iceberg', enabled: false },
        { name: 'audit_logging' },
      ];
      expect(coreHasEnterpriseFeatures(features)).toBe(true);
    });

    test('should return false when no features are enabled', () => {
      const features: ListEnterpriseFeaturesResponse_Feature[] = [
        { name: 'rbac', enabled: false },
        { name: 'datalake_iceberg', enabled: false },
        { name: 'audit_logging' },
      ];
      expect(coreHasEnterpriseFeatures(features)).toBe(false);
    });

    test('should return false for an empty list of features', () => {
      const features: ListEnterpriseFeaturesResponse_Feature[] = [];
      expect(coreHasEnterpriseFeatures(features)).toBe(false);
    });
  });

  describe('licenseIsExpired', () => {
    test('should return false for a community license', () => {
      expect(licenseIsExpired(mockLicenseCommunity)).toBe(false);
    });

    test('should return true for an expired enterprise license', () => {
      expect(licenseIsExpired(expiredLicense)).toBe(true);
    });

    test('should return false for a valid enterprise license', () => {
      expect(licenseIsExpired(mockLicenseEnterprise)).toBe(false);
    });
  });

  describe('licenseSoonToExpire', () => {
    test('should return true for an enterprise license expiring within the default 30 days', () => {
      expect(licenseSoonToExpire(mockLicenseEnterprise)).toBe(true);
    });

    test('should return false for a license not expiring soon', () => {
      const licenseNotExpiringSoon: License = new License({
        ...mockLicenseEnterprise,
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 60), // expires in 60 days
      });
      expect(licenseSoonToExpire(licenseNotExpiringSoon)).toBe(false);
    });

    test('should return false for a community license', () => {
      expect(licenseSoonToExpire(mockLicenseCommunity)).toBe(false);
    });
  });

  describe('prettyLicenseType', () => {
    test('should return "Community" for community licenses', () => {
      expect(prettyLicenseType(mockLicenseCommunity)).toBe('Community');
    });

    test('should return "Enterprise" for enterprise licenses', () => {
      expect(prettyLicenseType(mockLicenseEnterprise)).toBe('Enterprise');
    });

    test('should return detailed version with source when showSource is true, console license', () => {
      expect(prettyLicenseType(mockLicenseEnterprise, true)).toBe('Redpanda Enterprise');
    });
  });

  describe('prettyExpirationDate', () => {
    test.skip('should return a formatted expiration date for an expiring license', () => {
      expect(prettyExpirationDate(mockLicenseEnterprise)).toMatch(/\d{2}\/\d{2}\/\d{4}/); // MM/DD/YYYY format
    });

    test('should return an empty string for a community license', () => {
      expect(prettyExpirationDate(mockLicenseCommunity)).toBe('');
    });
  });

  describe('getPrettyTimeToExpiration', () => {
    test('should return a pretty time string for a license about to expire', () => {
      expect(getPrettyTimeToExpiration(mockLicenseEnterprise)).toContain('days');
    });

    test('should return "License has expired" for an expired license', () => {
      expect(getPrettyTimeToExpiration(expiredLicense)).toBe('License has expired');
    });
  });

  describe('licensesToSimplifiedPreview', () => {
    test('should group multiple licenses of the same type and show the earliest expiration', () => {
      const licenses = [
        new License({
          type: License_Type.ENTERPRISE,
          expiresAt: BigInt(2041321065),
          source: License_Source.REDPANDA_CONSOLE,
        }),
        new License({
          type: License_Type.ENTERPRISE,
          expiresAt: BigInt(4813575088),
          source: License_Source.REDPANDA_CORE,
        }),
      ];

      const result = licensesToSimplifiedPreview(licenses);
      expect(result).toEqual([{ name: 'Enterprise', expiresAt: '9/8/2034', isExpired: false }]); // Based on the earlier expiration timestamp
    });

    test('should handle licenses with different types separately', () => {
      const licenses = [
        new License({
          type: License_Type.COMMUNITY,
          expiresAt: BigInt(2041321065),
          source: License_Source.REDPANDA_CONSOLE,
        }),
        new License({
          type: License_Type.ENTERPRISE,
          expiresAt: BigInt(4813575088),
          source: License_Source.REDPANDA_CORE,
        }),
      ];

      const result = licensesToSimplifiedPreview(licenses);
      expect(result).toEqual([
        { name: 'Console Community', expiresAt: '', isExpired: false },
        { name: 'Redpanda Enterprise', expiresAt: '7/15/2122', isExpired: false }, // Based on the expiration timestamp
      ]);
    });
  });

  describe('resolveEnterpriseCTALink', () => {
    test('should return the correct URL for tryEnterprise with query parameters', () => {
      const result = resolveEnterpriseCTALink('tryEnterprise', '12345-uuid', true);
      expect(result).toBe('https://redpanda.com/try-enterprise?cluster_id=12345-uuid&platform=1');
    });

    test('should return the correct URL for upgrade with query parameters', () => {
      const result = resolveEnterpriseCTALink('upgrade', '67890-uuid', false);
      expect(result).toBe('https://redpanda.com/upgrade?cluster_id=67890-uuid&platform=2');
    });

    test('should encode special characters in query parameters', () => {
      const result = resolveEnterpriseCTALink('tryEnterprise', '12345&uuid', true);
      expect(result).toBe('https://redpanda.com/try-enterprise?cluster_id=12345%26uuid&platform=1');
    });

    test('should throw an error for an invalid EnterpriseLinkType', () => {
      // @ts-expect-error Testing invalid input
      expect(() => resolveEnterpriseCTALink('invalidType', '12345-uuid', true)).toThrow();
    });

    test('should handle redpanda platform correctly', () => {
      const result = resolveEnterpriseCTALink('tryEnterprise', '12345-uuid', true);
      expect(result).toContain('platform=1');
    });

    test('should handle kafka platform correctly', () => {
      const result = resolveEnterpriseCTALink('upgrade', '12345-uuid', false);
      expect(result).toContain('platform=2');
    });
  });
});
