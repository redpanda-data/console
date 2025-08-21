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

// Heap Analytics Configuration Constants
export const HEAP_APP_ID = '328327039';

interface HeapUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  avatarUrl?: string;
  [key: string]: string | number | undefined;
}

declare global {
  interface Window {
    heap: any;
  }
}

/**
 * Track user in Heap using the heap.identify() method
 * @param userData - User data to track in Heap
 */
export const trackHeapUser = (userData: HeapUserData) => {
  if (window.heap && userData.email) {
    window.heap.identify(userData.email);

    // biome-ignore lint/correctness/noUnusedVariables: We are intentionally ignoring this
    const { email, ...userProperties } = userData;
    if (Object.keys(userProperties).length > 0) {
      window.heap.addUserProperties(userProperties);
    }
  }
};

/**
 * Track custom events in Heap
 * @param eventName - The name of the event to track
 * @param properties - Optional properties to include with the event
 */
export const trackHeapEvent = (eventName: string, properties?: Record<string, any>) => {
  if (window.heap) {
    window.heap.track(eventName, properties);
  }
};

/**
 * Add user properties in Heap
 * @param properties - User properties to set
 */
export const setHeapUserProperties = (properties: Record<string, any>) => {
  if (window.heap) {
    window.heap.addUserProperties(properties);
  }
};

/**
 * Add event properties in Heap
 * @param properties - Event properties to set
 */
export const setHeapEventProperties = (properties: Record<string, any>) => {
  if (window.heap) {
    window.heap.addEventProperties(properties);
  }
};

/**
 * Reset user identity in Heap
 */
export const resetHeapIdentity = () => {
  if (window.heap) {
    window.heap.resetIdentity();
  }
};
