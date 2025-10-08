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

import axios from 'axios';
// biome-ignore lint/performance/noNamespaceImport: part of es-cookie
import * as Cookies from 'es-cookie';

import { isAnalyticsEnabled } from '../utils/analytics';

type Fields = {
  [key: string]: string | number;
};

// HubSpot Configuration Constants
export const HUBSPOT_REGION = 'na1';
export const HUBSPOT_PORTAL_ID = '7733588';
export const HUBSPOT_TRACKING_COOKIE_TOKEN = 'hubspotutk';
export const HUBSPOT_AI_AGENTS_FORM_ID = '79585297-4032-440e-bb62-4f3b72954e81';

type HubspotSubmitProps = {
  fields: Fields;
  formId: string;
  portalId?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
};

type HubspotUserData = {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  avatarUrl?: string;
  [key: string]: string | number | undefined;
};

declare global {
  interface Window {
    _hsq: any[];
  }
}

export const hubspotSubmit = ({
  portalId = HUBSPOT_PORTAL_ID,
  formId,
  fields,
  onSuccess,
  onError,
}: HubspotSubmitProps) => {
  // Check if analytics is enabled
  if (!isAnalyticsEnabled()) {
    return;
  }
  const prepareFields = (fields: Fields) =>
    Object.entries(fields).map(([name, value]) => ({
      name,
      value,
    }));

  axios
    .post(`https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formId}`, {
      fields: prepareFields(fields),
      context: {
        hutk: Cookies.get(HUBSPOT_TRACKING_COOKIE_TOKEN),
        pageUri: window?.location?.href,
        pageName: document?.title,
      },
    })
    .then((response) => {
      if (onSuccess) {
        onSuccess(response);
      }
    })
    .catch((error) => {
      if (onError) {
        onError(error);
      }
    });
};

/**
 * Track user in HubSpot using the _hsq.push(['identify', data]) method
 * @param userData - User data to track in HubSpot
 */
export const trackHubspotUser = (userData: HubspotUserData) => {
  if (!isAnalyticsEnabled()) {
    return;
  }
  window._hsq = window._hsq || [];
  window._hsq.push(['identify', userData]);
};

/**
 * Track page navigation in HubSpot using the _hsq.push(['setPath', { path }]) method
 * @param path - The current page path to track
 */
export const trackHubspotPage = (path: string) => {
  if (!isAnalyticsEnabled()) {
    return;
  }
  window._hsq = window._hsq || [];
  window._hsq.push(['setPath', { path }]);
};
