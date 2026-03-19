import type { Interceptor } from '@connectrpc/connect';
import { createContext, useContext } from 'react';

let registeredTokenRefreshInterceptor: Interceptor | undefined;

const TokenRefreshInterceptorContext = createContext<Interceptor | undefined>(undefined);

export const TokenRefreshInterceptorProvider = TokenRefreshInterceptorContext.Provider;

export const setRegisteredTokenRefreshInterceptor = (interceptor: Interceptor | undefined) => {
  registeredTokenRefreshInterceptor = interceptor;
};

export const getRegisteredTokenRefreshInterceptor = () => registeredTokenRefreshInterceptor;

export const useTokenRefreshInterceptor = () =>
  useContext(TokenRefreshInterceptorContext) ?? getRegisteredTokenRefreshInterceptor();
