/* eslint-disable no-extend-native */
import {
  licenseIsExpired,
  licenseSoonToExpire,
  prettyLicenseType,
  prettyExpirationDate,
  getPrettyTimeToExpiration,
  licensesToSimplifiedPreview,
} from './licenseUtils';
import { License, License_Type, License_Source } from '../../protogen/redpanda/api/console/v1alpha1/license_pb';

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

  describe('licenseIsExpired', () => {
    it('should return false for a community license', () => {
      expect(licenseIsExpired(mockLicenseCommunity)).toBe(false);
    });

    it('should return true for an expired enterprise license', () => {
      expect(licenseIsExpired(expiredLicense)).toBe(true);
    });

    it('should return false for a valid enterprise license', () => {
      expect(licenseIsExpired(mockLicenseEnterprise)).toBe(false);
    });
  });

  describe('licenseSoonToExpire', () => {
    it('should return true for an enterprise license expiring within the default 30 days', () => {
      expect(licenseSoonToExpire(mockLicenseEnterprise)).toBe(true);
    });

    it('should return false for a license not expiring soon', () => {
      const licenseNotExpiringSoon: License = new License({
        ...mockLicenseEnterprise,
        expiresAt: BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 60), // expires in 60 days
      });
      expect(licenseSoonToExpire(licenseNotExpiringSoon)).toBe(false);
    });

    it('should return false for a community license', () => {
      expect(licenseSoonToExpire(mockLicenseCommunity)).toBe(false);
    });
  });

  describe('prettyLicenseType', () => {
    it('should return "Community" for community licenses', () => {
      expect(prettyLicenseType(mockLicenseCommunity)).toBe('Community');
    });

    it('should return "Enterprise" for enterprise licenses', () => {
      expect(prettyLicenseType(mockLicenseEnterprise)).toBe('Enterprise');
    });

    it('should return detailed version with source when showSource is true, console license', () => {
      expect(prettyLicenseType(mockLicenseEnterprise, true)).toBe('Core Enterprise');
    });
  });

  describe('prettyExpirationDate', () => {
    it('should return a formatted expiration date for an expiring license', () => {
      expect(prettyExpirationDate(mockLicenseEnterprise)).toMatch(/\d{2}\/\d{2}\/\d{4}/); // MM/DD/YYYY format
    });

    it('should return an empty string for a community license', () => {
      expect(prettyExpirationDate(mockLicenseCommunity)).toBe('');
    });
  });

  describe('getPrettyTimeToExpiration', () => {
    it('should return a pretty time string for a license about to expire', () => {
      expect(getPrettyTimeToExpiration(mockLicenseEnterprise)).toContain('days');
    });

    it('should return "License has expired" for an expired license', () => {
      expect(getPrettyTimeToExpiration(expiredLicense)).toBe('License has expired');
    });
  });

  describe('licensesToSimplifiedPreview', () => {
    it('should group multiple licenses of the same type and show the earliest expiration', () => {
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
      expect(result).toEqual([{ name: 'Enterprise', expiresAt: '9/8/2034' }]); // Based on the earlier expiration timestamp
    });

    it('should handle licenses with different types separately', () => {
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
        { name: 'Console Community', expiresAt: '' },
        { name: 'Core Enterprise', expiresAt: '7/15/2122' }, // Based on the expiration timestamp
      ]);
    });
  });
});
