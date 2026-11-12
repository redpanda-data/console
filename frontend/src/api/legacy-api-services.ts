export type LegacyApiServices = {
  rest: <T>(url: string, requestInit?: RequestInit) => Promise<T | null>;
  cachedApiRequest: <T>(url: string, force?: boolean) => Promise<T>;
  parseOrUnwrap: <T>(response: Response, text: string | null) => Promise<T>;
  addError: (error: Error) => undefined;
  handleExpiredLicenseError: (response: Response) => Promise<void>;
};
