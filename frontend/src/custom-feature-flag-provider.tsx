import { FEATURE_FLAGS } from 'components/constants';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type FeatureFlags = {
  [key: string]: boolean;
};

type FeatureFlagContextType = {
  flags: FeatureFlags;
  setFlag: (key: string, value: boolean) => void;
  getBooleanFlagValue: (key: keyof typeof FEATURE_FLAGS, defaultValue?: boolean) => boolean;
};

const FeatureFlagContext = createContext<FeatureFlagContextType>({
  flags: {},
  setFlag: () => {
    // no op - default context value
  },
  getBooleanFlagValue: () => false,
});

type CustomFeatureFlagProviderProps = {
  children: ReactNode;
  initialFlags?: FeatureFlags;
};

export const CustomFeatureFlagProvider = ({
  children,
  initialFlags = FEATURE_FLAGS,
}: CustomFeatureFlagProviderProps) => {
  const [flags, setFlags] = useState<FeatureFlags>(initialFlags);

  const setFlag = useCallback((key: string, value: boolean) => {
    setFlags((prevFlags) => ({
      ...prevFlags,
      [key]: value,
    }));
  }, []);

  const getBooleanFlagValue = useCallback(
    (key: keyof typeof FEATURE_FLAGS, defaultValue = false) => (flags[key] !== undefined ? flags[key] : defaultValue),
    [flags]
  );

  const contextValue = useMemo(
    () => ({
      flags,
      setFlag,
      getBooleanFlagValue,
    }),
    [flags, setFlag, getBooleanFlagValue]
  );

  return <FeatureFlagContext.Provider value={contextValue}>{children}</FeatureFlagContext.Provider>;
};

export const useBooleanFlagValue = (key: keyof typeof FEATURE_FLAGS, defaultValue = false): boolean => {
  const context = useContext(FeatureFlagContext);

  if (!context) {
    // throw new Error('useBooleanFlagValue must be used within a CustomFeatureFlagProvider');
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('useBooleanFlagValue must be used within a CustomFeatureFlagProvider');
    return defaultValue; // Fall back to false if the flag is not set.
  }

  return context.getBooleanFlagValue(key, defaultValue);
};

export const useFeatureFlags = (): FeatureFlagContextType => {
  const context = useContext(FeatureFlagContext);

  if (!context) {
    // throw new Error('useFeatureFlags must be used within a CustomFeatureFlagProvider');
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.warn('useFeatureFlags must be used within a CustomFeatureFlagProvider');
  }

  return context;
};
