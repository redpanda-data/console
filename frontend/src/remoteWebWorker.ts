// Patch Worker to allow loading scripts from remote URLs
//
// It's a workaround for the fact that the Worker constructor
// accepts only local URLs, not remote URLs:
// https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker
//
// As a workaround this patched Worker constructor will
// use `importScripts` to load the remote script.
// https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts
//
// Compatibility: Chrome 4+, Firefox 4+, Safari 4+
//
// Usage:
// ```ts
// import "remote-web-worker";
// ```
typeof window !== 'undefined' &&
    (Worker = ((BaseWorker: typeof Worker) =>
        // eslint-disable-next-line no-global-assign
        class Worker extends BaseWorker {
            constructor(scriptURL: string | URL, options?: WorkerOptions) {
                const url = String(scriptURL);

                super(
                    // Check if the URL is remote
                    url.includes('://')
                        ? // Launch the worker with an inline script that will use `importScripts`
                          // to bootstrap the actual script to work around the same origin policy.
                          URL.createObjectURL(
                              new Blob(
                                  [
                                      // Replace the `importScripts` function with
                                      // a patched version that will resolve relative URLs
                                      // to the remote script URL.
                                      //
                                      // Without a patched `importScripts` Webpack 5 generated worker chunks will fail with the following error:
                                      //
                                      // Uncaught (in promise) DOMException: Failed to execute 'importScripts' on 'WorkerGlobalScope':
                                      // The script at 'http://some.domain/worker.1e0e1e0e.js' failed to load.
                                      //
                                      // For minification, the inlined variable names are single letters:
                                      // i = original importScripts
                                      // a = arguments
                                      // u = URL
                                      `importScripts("${url}")`,
                                  ],
                                  { type: 'text/javascript' }
                              )
                          )
                        : scriptURL,
                    options
                );
            }
        })(Worker));

export {};
