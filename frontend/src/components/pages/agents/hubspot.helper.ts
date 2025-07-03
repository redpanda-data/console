import axios from 'axios';
// biome-ignore lint/performance/noNamespaceImport: part of es-cookie
import * as Cookies from 'es-cookie';

interface Fields {
  [key: string]: string | number;
}

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
