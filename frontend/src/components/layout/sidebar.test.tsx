import { act, renderHook } from '@testing-library/react';
import { createGroupedSidebarItems } from 'utils/route-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EndpointCompatibility } from '../../state/rest-interfaces';
import { Feature, useSupportedFeaturesStore } from '../../state/supported-features';

// Mock config to enable embedded + ADP mode (required for Transcripts route visibility)
vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config')>();
  return {
    ...actual,
    isEmbedded: () => true,
    isAdpEnabled: () => true,
  };
});

describe('SidebarNavigation re-renders on endpointCompatibility change (UX-972)', () => {
  afterEach(() => {
    // Reset store to initial state between tests
    useSupportedFeaturesStore.setState({
      endpointCompatibility: null,
      tracingService: false,
    });
  });

  it('TracingService defaults to unsupported when endpointCompatibility is null', () => {
    const state = useSupportedFeaturesStore.getState();
    expect(state.endpointCompatibility).toBeNull();
    expect(state.tracingService).toBe(false);
  });

  it('Transcripts item is hidden when TracingService is not supported', () => {
    const groups = createGroupedSidebarItems();
    const allItems = groups.flatMap((g) => g.items);
    const transcripts = allItems.find((item) => item.to === '/transcripts');
    expect(transcripts).toBeUndefined();
  });

  it('Transcripts item appears after endpointCompatibility loads with TracingService supported', () => {
    const compatibility: EndpointCompatibility = {
      kafkaVersion: '3.6.0',
      endpoints: [
        {
          endpoint: Feature.TracingService.endpoint,
          method: Feature.TracingService.method,
          isSupported: true,
        },
      ],
    };

    act(() => {
      useSupportedFeaturesStore.getState().setEndpointCompatibility(compatibility);
    });

    const groups = createGroupedSidebarItems();
    const allItems = groups.flatMap((g) => g.items);
    const transcripts = allItems.find((item) => item.to === '/transcripts');
    expect(transcripts).toBeDefined();
    expect(transcripts?.title).toBe('Transcripts');
  });

  it('store selector triggers re-render when endpointCompatibility changes', async () => {
    const selector = (s: { endpointCompatibility: EndpointCompatibility | null }) => s.endpointCompatibility;
    const { result, unmount } = renderHook(() => useSupportedFeaturesStore(selector));

    expect(result.current).toBeNull();

    const compatibility: EndpointCompatibility = {
      kafkaVersion: '3.6.0',
      endpoints: [
        {
          endpoint: Feature.TracingService.endpoint,
          method: Feature.TracingService.method,
          isSupported: true,
        },
      ],
    };

    // Zustand's useSyncExternalStore subscriber schedules the re-render
    // synchronously, but renderHook's TestComponent runs a trailing useEffect
    // to sync `result.current`. Wrap the store mutation in async act() so
    // the boundary awaits the microtask + effect flush before the assertion.
    await act(async () => {
      useSupportedFeaturesStore.getState().setEndpointCompatibility(compatibility);
    });

    expect(result.current).toBe(compatibility);

    // Unmount before the afterEach's store reset fires, otherwise the
    // reset triggers an update on the still-mounted TestComponent outside
    // any act boundary and emits the "not wrapped in act(...)" warning.
    unmount();
  });
});
