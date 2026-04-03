type NotifyEmbeddedAuthErrorArgs = {
  clusterId?: string;
  path?: string;
};

export const notifyEmbeddedAuthError = ({
  clusterId,
  path = window.location.pathname,
}: NotifyEmbeddedAuthErrorArgs) => {
  window.dispatchEvent(
    new CustomEvent('console:auth-error', {
      detail: { clusterId, path },
    })
  );
};
