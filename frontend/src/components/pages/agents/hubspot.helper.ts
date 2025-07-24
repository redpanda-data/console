import axios from 'axios';
// biome-ignore lint/performance/noNamespaceImport: part of es-cookie
import * as Cookies from 'es-cookie';

interface Fields {
  [key: string]: string | number;
}

// HubSpot Configuration Constants
export const HUBSPOT_REGION = 'na1';
export const HUBSPOT_PORTAL_ID = '7733588';
export const HUBSPOT_TRACKING_COOKIE_TOKEN = 'hubspotutk';
export const HUBSPOT_AI_AGENTS_FORM_ID = '79585297-4032-440e-bb62-4f3b72954e81';

interface HubspotSubmitProps {
  fields: Fields;
  formId: string;
  portalId?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

interface HubspotUserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  avatarUrl?: string;
  [key: string]: string | number | undefined;
}

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
      if (onSuccess) onSuccess(response);
    })
    .catch((error) => {
      if (onError) onError(error);
    });
};

/**
 * Track user in HubSpot using the _hsq.push(['identify', data]) method
 * @param userData - User data to track in HubSpot
 */
export const trackHubspotUser = (userData: HubspotUserData) => {
  window._hsq = window._hsq || [];
  window._hsq.push(['identify', userData]);
};

/**
 * Track page navigation in HubSpot using the _hsq.push(['setPath', { path }]) method
 * @param path - The current page path to track
 */
export const trackHubspotPage = (path: string) => {
  window._hsq = window._hsq || [];
  window._hsq.push(['setPath', { path }]);
};


