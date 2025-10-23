import { createContext, memo, type ReactNode, useContext } from 'react';
import { isAnalyticsEnabled } from 'utils/analytics';

type AnalyticsContextType = {
  /**
   * Callback for Console to track analytics events
   * @param eventName - The name of the event
   * @param eventData - Optional additional event data
   */
  captureEvent?: (eventName: string, eventData?: Record<string, unknown>) => void;
  /**
   * Callback for Console to identify user and track analytics events in one call
   * @param eventName - The name of the event
   * @param eventData - Optional additional event data
   */
  captureUserEvent?: (eventName: string, eventData?: Record<string, unknown>) => void;
};

type AnalyticsProviderProps = {
  value: AnalyticsContextType;
  children: ReactNode;
};

const AnalyticsContext = createContext<AnalyticsContextType>({});

export const AnalyticsProvider = memo(({ children, value }: AnalyticsProviderProps) => (
  <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>
));

export const useAnalytics = (): AnalyticsContextType => {
  const context = useContext(AnalyticsContext);

  if (!isAnalyticsEnabled()) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('Analytics is not enabled');
  }
  if (!context) {
    // throw new Error('useAnalytics must be used within a AnalyticsProvider');
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('useAnalytics must be used within a AnalyticsProvider');
  }

  return context;
};
