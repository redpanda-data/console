/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, it, vi } from 'vitest';

import {
  decodeFiltersFromUrl,
  encodeFiltersForUrl,
  type FilterEntryForUrl,
  filterToUrlFormat,
  mergeUrlFiltersWithExisting,
  urlFormatToFilter,
} from './filter-url-encoding';
import { FilterEntry } from '../state/ui';

// Enable automatic store reset between tests
vi.mock('zustand');

// Regex patterns for tests (performance optimization)
const PLUS_REGEX = /\+/g;
const SLASH_REGEX = /\//g;
const PADDING_REGEX = /=+$/;

describe('filter-url-encoding', () => {
  describe('filterToUrlFormat', () => {
    it('should convert FilterEntry to URL format', () => {
      const filter = new FilterEntry();
      filter.id = 'test-id-123';
      filter.isActive = true;
      filter.name = 'Test Filter';
      filter.code = 'return value.length > 5';
      filter.transpiledCode = 'return value.length > 5;';

      const result = filterToUrlFormat(filter);

      expect(result).toEqual({
        id: 'test-id-123',
        isActive: true,
        name: 'Test Filter',
        code: 'return value.length > 5',
        transpiledCode: 'return value.length > 5;',
      });
    });

    it('should handle empty name', () => {
      const filter = new FilterEntry();
      filter.id = 'test-id';
      filter.name = '';

      const result = filterToUrlFormat(filter);

      expect(result.name).toBe('');
    });
  });

  describe('encodeFiltersForUrl', () => {
    it('should encode filters array to URL-safe base64 string', () => {
      const filter = new FilterEntry();
      filter.id = 'test-123';
      filter.isActive = true;
      filter.name = 'My Filter';
      filter.code = 'return true';
      filter.transpiledCode = 'return true;';

      const encoded = encodeFiltersForUrl([filter]);

      expect(encoded).toBeTruthy();
      expect(encoded).not.toContain('+'); // base64url format
      expect(encoded).not.toContain('/'); // base64url format
      expect(encoded).not.toContain('='); // padding removed
    });

    it('should return empty string for empty array', () => {
      expect(encodeFiltersForUrl([])).toBe('');
    });

    it('should handle multiple filters', () => {
      const filter1 = new FilterEntry();
      filter1.id = 'filter-1';
      filter1.isActive = true;
      filter1.name = 'Filter 1';
      filter1.code = 'return value > 10';
      filter1.transpiledCode = 'return value > 10;';

      const filter2 = new FilterEntry();
      filter2.id = 'filter-2';
      filter2.isActive = false;
      filter2.name = 'Filter 2';
      filter2.code = 'return key.startsWith("test")';
      filter2.transpiledCode = 'return key.startsWith("test");';

      const encoded = encodeFiltersForUrl([filter1, filter2]);

      expect(encoded).toBeTruthy();
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe('decodeFiltersFromUrl', () => {
    it('should decode valid URL parameter back to filters', () => {
      const original: FilterEntryForUrl[] = [
        {
          id: 'test-123',
          isActive: true,
          name: 'My Filter',
          code: 'return true',
          transpiledCode: 'return true;',
        },
      ];

      const json = JSON.stringify(original);
      const base64 = btoa(json).replace(PLUS_REGEX, '-').replace(SLASH_REGEX, '_').replace(PADDING_REGEX, '');

      const decoded = decodeFiltersFromUrl(base64);

      expect(decoded).toEqual(original);
    });

    it('should return null for null input', () => {
      expect(decodeFiltersFromUrl(null)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(decodeFiltersFromUrl('')).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(decodeFiltersFromUrl('invalid!!!base64')).toBeNull();
    });

    it('should return null for non-array JSON', () => {
      const json = JSON.stringify({ not: 'array' });
      const base64 = btoa(json).replace(PLUS_REGEX, '-').replace(SLASH_REGEX, '_').replace(PADDING_REGEX, '');

      expect(decodeFiltersFromUrl(base64)).toBeNull();
    });

    it('should filter out invalid filter objects', () => {
      const mixed = [
        {
          id: 'valid-1',
          isActive: true,
          name: 'Valid',
          code: 'return true',
          transpiledCode: 'return true;',
        },
        { id: 'invalid', isActive: true }, // missing fields
        'not an object',
        null,
      ];

      const json = JSON.stringify(mixed);
      const base64 = btoa(json).replace(PLUS_REGEX, '-').replace(SLASH_REGEX, '_').replace(PADDING_REGEX, '');

      const decoded = decodeFiltersFromUrl(base64);

      expect(decoded).toHaveLength(1);
      expect(decoded?.[0].id).toBe('valid-1');
    });
  });

  describe('urlFormatToFilter', () => {
    it('should convert URL format back to FilterEntry', () => {
      const urlFilter: FilterEntryForUrl = {
        id: 'test-123',
        isActive: false,
        name: 'Test Filter',
        code: 'return value > 5',
        transpiledCode: 'return value > 5;',
      };

      const filter = urlFormatToFilter(urlFilter);

      expect(filter.id).toBe('test-123');
      expect(filter.isActive).toBe(false);
      expect(filter.name).toBe('Test Filter');
      expect(filter.code).toBe('return value > 5');
      expect(filter.transpiledCode).toBe('return value > 5;');
      expect(filter.isNew).toBe(false);
    });
  });

  describe('mergeUrlFiltersWithExisting', () => {
    it('should prioritize URL filters over existing ones with same ID', () => {
      const existingFilter = new FilterEntry();
      existingFilter.id = 'filter-1';
      existingFilter.name = 'Old Name';
      existingFilter.code = 'return false';
      existingFilter.isActive = false;

      const urlFilters: FilterEntryForUrl[] = [
        {
          id: 'filter-1',
          isActive: true,
          name: 'New Name',
          code: 'return true',
          transpiledCode: 'return true;',
        },
      ];

      const merged = mergeUrlFiltersWithExisting(urlFilters, [existingFilter]);

      expect(merged).toHaveLength(1);
      expect(merged[0].name).toBe('New Name');
      expect(merged[0].code).toBe('return true');
      expect(merged[0].isActive).toBe(true);
    });

    it('should preserve existing filters not in URL', () => {
      const existing1 = new FilterEntry();
      existing1.id = 'filter-1';
      existing1.name = 'Filter 1';

      const existing2 = new FilterEntry();
      existing2.id = 'filter-2';
      existing2.name = 'Filter 2';

      const urlFilters: FilterEntryForUrl[] = [
        {
          id: 'filter-3',
          isActive: true,
          name: 'Filter 3',
          code: 'return true',
          transpiledCode: 'return true;',
        },
      ];

      const merged = mergeUrlFiltersWithExisting(urlFilters, [existing1, existing2]);

      expect(merged).toHaveLength(3);
      expect(merged.map((f) => f.id)).toContain('filter-1');
      expect(merged.map((f) => f.id)).toContain('filter-2');
      expect(merged.map((f) => f.id)).toContain('filter-3');
    });

    it('should return existing filters when URL filters is null', () => {
      const existing = new FilterEntry();
      existing.id = 'filter-1';

      const merged = mergeUrlFiltersWithExisting(null, [existing]);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('filter-1');
    });

    it('should return existing filters when URL filters is empty', () => {
      const existing = new FilterEntry();
      existing.id = 'filter-1';

      const merged = mergeUrlFiltersWithExisting([], [existing]);

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('filter-1');
    });
  });

  describe('round-trip encoding', () => {
    it('should successfully encode and decode filters', () => {
      const filter1 = new FilterEntry();
      filter1.id = 'filter-1';
      filter1.isActive = true;
      filter1.name = 'Price Filter';
      filter1.code = 'return value.price > 100';
      filter1.transpiledCode = 'return value.price > 100;';

      const filter2 = new FilterEntry();
      filter2.id = 'filter-2';
      filter2.isActive = false;
      filter2.name = 'Status Filter';
      filter2.code = 'return value.status === "active"';
      filter2.transpiledCode = 'return value.status === "active";';

      const encoded = encodeFiltersForUrl([filter1, filter2]);
      const decoded = decodeFiltersFromUrl(encoded);

      expect(decoded).toHaveLength(2);
      expect(decoded?.[0].id).toBe('filter-1');
      expect(decoded?.[0].name).toBe('Price Filter');
      expect(decoded?.[0].code).toBe('return value.price > 100');
      expect(decoded?.[1].id).toBe('filter-2');
      expect(decoded?.[1].name).toBe('Status Filter');
      expect(decoded?.[1].isActive).toBe(false);
    });

    it('should handle special characters in filter code', () => {
      const filter = new FilterEntry();
      filter.id = 'test-filter';
      filter.isActive = true;
      filter.name = 'Special Chars: <>&"\'';
      filter.code = 'return value.match(/[a-z]+/) && value.includes("test")';
      filter.transpiledCode = 'return value.match(/[a-z]+/) && value.includes("test");';

      const encoded = encodeFiltersForUrl([filter]);
      const decoded = decodeFiltersFromUrl(encoded);

      expect(decoded).toHaveLength(1);
      expect(decoded?.[0].name).toBe('Special Chars: <>&"\'');
      expect(decoded?.[0].code).toBe('return value.match(/[a-z]+/) && value.includes("test")');
    });
  });
});
