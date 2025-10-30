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

import { beforeEach, describe, expect, test, vi } from 'vitest';

// Enable automatic store reset between tests - must be before imports
vi.mock('zustand');

import { act, renderHook } from '@testing-library/react';

import {
  CONNECT_WIZARD_CONNECTOR_KEY,
  onboardingWizardStore,
  useOnboardingTopicDataStore,
  useOnboardingUserDataStore,
  useOnboardingWizardDataStore,
  useResetOnboardingWizardStore,
} from './onboarding-wizard-store';
import type { OnboardingWizardFormData } from '../components/pages/rp-connect/types/wizard';

describe('Onboarding Wizard Store', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('useOnboardingWizardDataStore', () => {
    test('should initialize with empty state', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      expect(result.current.input).toBeUndefined();
      expect(result.current.output).toBeUndefined();
    });

    test('should set wizard data', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      const wizardData: Partial<OnboardingWizardFormData> = {
        input: {
          connectionName: 'redpanda',
          connectionType: 'input',
        },
      };

      act(() => {
        result.current.setWizardData(wizardData);
      });

      expect(result.current.input).toEqual(wizardData.input);
    });

    test('should merge wizard data on multiple sets', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      act(() => {
        result.current.setWizardData({
          input: { connectionName: 'redpanda', connectionType: 'input' },
        });
      });

      act(() => {
        result.current.setWizardData({
          output: { connectionName: 'kafka_franz', connectionType: 'output' },
        });
      });

      expect(result.current.input).toEqual({ connectionName: 'redpanda', connectionType: 'input' });
      expect(result.current.output).toEqual({ connectionName: 'kafka_franz', connectionType: 'output' });
    });

    test('should reset wizard data completely', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      act(() => {
        result.current.setWizardData({
          input: { connectionName: 'redpanda', connectionType: 'input' },
          output: { connectionName: 'kafka_franz', connectionType: 'output' },
        });
      });

      expect(result.current.input).toBeDefined();
      expect(result.current.output).toBeDefined();

      act(() => {
        result.current.reset();
      });

      expect(result.current.input).toBeUndefined();
      expect(result.current.output).toBeUndefined();
    });

    test('should preserve action methods after reset', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      act(() => {
        result.current.setWizardData({ input: { connectionName: 'test', connectionType: 'input' } });
      });

      act(() => {
        result.current.reset();
      });

      // Actions should still work after reset
      expect(() => {
        act(() => {
          result.current.setWizardData({ input: { connectionName: 'new', connectionType: 'input' } });
        });
      }).not.toThrow();

      expect(result.current.input).toEqual({ connectionName: 'new', connectionType: 'input' });
    });

    test('should persist wizard data to sessionStorage', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      const wizardData: Partial<OnboardingWizardFormData> = {
        input: { connectionName: 'redpanda', connectionType: 'input' },
      };

      act(() => {
        result.current.setWizardData(wizardData);
      });

      const stored = sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY);
      expect(stored).toBeTruthy();
      if (stored) {
        expect(JSON.parse(stored)).toMatchObject(wizardData);
      }
    });

    test('should clear sessionStorage on reset', () => {
      const { result } = renderHook(() => useOnboardingWizardDataStore());

      act(() => {
        result.current.setWizardData({ input: { connectionName: 'test', connectionType: 'input' } });
      });

      expect(sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY)).toBeTruthy();

      act(() => {
        result.current.reset();
      });

      // Persist middleware should clear storage on reset
      const stored = sessionStorage.getItem(CONNECT_WIZARD_CONNECTOR_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      expect(parsed.input).toBeUndefined();
      expect(parsed.output).toBeUndefined();
    });
  });

  describe('useOnboardingTopicDataStore', () => {
    test('should initialize with empty state', () => {
      const { result } = renderHook(() => useOnboardingTopicDataStore());

      expect(result.current.topicName).toBeUndefined();
    });

    test('should set topic data', () => {
      const { result } = renderHook(() => useOnboardingTopicDataStore());

      act(() => {
        result.current.setTopicData({ topicName: 'my-topic' });
      });

      expect(result.current.topicName).toBe('my-topic');
    });

    test('should reset topic data completely', () => {
      const { result } = renderHook(() => useOnboardingTopicDataStore());

      act(() => {
        result.current.setTopicData({ topicName: 'my-topic' });
      });

      expect(result.current.topicName).toBe('my-topic');

      act(() => {
        result.current.reset();
      });

      expect(result.current.topicName).toBeUndefined();
    });

    test('should NOT persist to sessionStorage', () => {
      const { result } = renderHook(() => useOnboardingTopicDataStore());

      act(() => {
        result.current.setTopicData({ topicName: 'my-topic' });
      });

      // Should not create any sessionStorage entry
      const allKeys = Object.keys(sessionStorage);
      const topicKeys = allKeys.filter((key) => key.includes('topic'));
      expect(topicKeys).toHaveLength(0);
    });

    test('should preserve action methods after reset', () => {
      const { result } = renderHook(() => useOnboardingTopicDataStore());

      act(() => {
        result.current.setTopicData({ topicName: 'topic-1' });
      });

      act(() => {
        result.current.reset();
      });

      // Actions should still work after reset
      expect(() => {
        act(() => {
          result.current.setTopicData({ topicName: 'topic-2' });
        });
      }).not.toThrow();

      expect(result.current.topicName).toBe('topic-2');
    });
  });

  describe('useOnboardingUserDataStore', () => {
    test('should initialize with empty state', () => {
      const { result } = renderHook(() => useOnboardingUserDataStore());

      expect(result.current.username).toBeUndefined();
      expect(result.current.saslMechanism).toBeUndefined();
    });

    test('should set user data', () => {
      const { result } = renderHook(() => useOnboardingUserDataStore());

      act(() => {
        result.current.setUserData({
          username: 'test-user',
          saslMechanism: 'SCRAM-SHA-256',
        });
      });

      expect(result.current.username).toBe('test-user');
      expect(result.current.saslMechanism).toBe('SCRAM-SHA-256');
    });

    test('should reset user data completely', () => {
      const { result } = renderHook(() => useOnboardingUserDataStore());

      act(() => {
        result.current.setUserData({
          username: 'test-user',
          saslMechanism: 'SCRAM-SHA-256',
        });
      });

      expect(result.current.username).toBe('test-user');

      act(() => {
        result.current.reset();
      });

      expect(result.current.username).toBeUndefined();
      expect(result.current.saslMechanism).toBeUndefined();
    });

    test('should NOT persist to sessionStorage', () => {
      const { result } = renderHook(() => useOnboardingUserDataStore());

      act(() => {
        result.current.setUserData({ username: 'test-user' });
      });

      // Should not create any sessionStorage entry
      const allKeys = Object.keys(sessionStorage);
      const userKeys = allKeys.filter((key) => key.includes('user'));
      expect(userKeys).toHaveLength(0);
    });

    test('should preserve action methods after reset', () => {
      const { result } = renderHook(() => useOnboardingUserDataStore());

      act(() => {
        result.current.setUserData({ username: 'user-1' });
      });

      act(() => {
        result.current.reset();
      });

      // Actions should still work after reset
      expect(() => {
        act(() => {
          result.current.setUserData({ username: 'user-2' });
        });
      }).not.toThrow();

      expect(result.current.username).toBe('user-2');
    });
  });

  describe('useResetOnboardingWizardStore', () => {
    test('should reset all three stores', () => {
      const wizardResult = renderHook(() => useOnboardingWizardDataStore()).result;
      const topicResult = renderHook(() => useOnboardingTopicDataStore()).result;
      const userResult = renderHook(() => useOnboardingUserDataStore()).result;
      const { result: resetResult } = renderHook(() => useResetOnboardingWizardStore());

      // Set data in all stores
      act(() => {
        wizardResult.current.setWizardData({ input: { connectionName: 'test', connectionType: 'input' } });
        topicResult.current.setTopicData({ topicName: 'my-topic' });
        userResult.current.setUserData({ username: 'test-user' });
      });

      expect(wizardResult.current.input).toBeDefined();
      expect(topicResult.current.topicName).toBe('my-topic');
      expect(userResult.current.username).toBe('test-user');

      // Reset all stores
      act(() => {
        resetResult.current();
      });

      expect(wizardResult.current.input).toBeUndefined();
      expect(topicResult.current.topicName).toBeUndefined();
      expect(userResult.current.username).toBeUndefined();
    });

    test('should return stable callback reference', () => {
      const { result, rerender } = renderHook(() => useResetOnboardingWizardStore());

      const firstCallback = result.current;
      rerender();
      const secondCallback = result.current;

      expect(firstCallback).toBe(secondCallback);
    });
  });

  describe('onboardingWizardStore (Imperative API)', () => {
    test('getWizardData should return only data fields', () => {
      act(() => {
        onboardingWizardStore.setWizardData({ input: { connectionName: 'test', connectionType: 'input' } });
      });

      const data = onboardingWizardStore.getWizardData();

      expect(data.input).toBeDefined();

      expect(Object.hasOwn(data, 'setWizardData')).toBe(false);
      expect(Object.hasOwn(data, 'reset')).toBe(false);

      const keys = Object.keys(data);
      expect(keys).not.toContain('setWizardData');
      expect(keys).not.toContain('reset');
    });

    test('getTopicData should return only data fields', () => {
      act(() => {
        onboardingWizardStore.setTopicData({ topicName: 'my-topic' });
      });

      const data = onboardingWizardStore.getTopicData();

      expect(data.topicName).toBe('my-topic');

      expect(Object.hasOwn(data, 'setTopicData')).toBe(false);
      expect(Object.hasOwn(data, 'reset')).toBe(false);

      const keys = Object.keys(data);
      expect(keys).not.toContain('setTopicData');
      expect(keys).not.toContain('reset');
    });

    test('getUserData should return only data fields', () => {
      act(() => {
        onboardingWizardStore.setUserData({ username: 'test-user' });
      });

      const data = onboardingWizardStore.getUserData();

      expect(data.username).toBe('test-user');

      expect(Object.hasOwn(data, 'setUserData')).toBe(false);
      expect(Object.hasOwn(data, 'reset')).toBe(false);

      const keys = Object.keys(data);
      expect(keys).not.toContain('setUserData');
      expect(keys).not.toContain('reset');
    });

    test('reset should clear all stores', () => {
      act(() => {
        onboardingWizardStore.setWizardData({ input: { connectionName: 'test', connectionType: 'input' } });
        onboardingWizardStore.setTopicData({ topicName: 'my-topic' });
        onboardingWizardStore.setUserData({ username: 'test-user' });
      });

      expect(onboardingWizardStore.getWizardData().input).toBeDefined();
      expect(onboardingWizardStore.getTopicData().topicName).toBe('my-topic');
      expect(onboardingWizardStore.getUserData().username).toBe('test-user');

      act(() => {
        onboardingWizardStore.reset();
      });

      expect(onboardingWizardStore.getWizardData().input).toBeUndefined();
      expect(onboardingWizardStore.getTopicData().topicName).toBeUndefined();
      expect(onboardingWizardStore.getUserData().username).toBeUndefined();
    });
  });
});
