---
title: Hosting
path: /docs/features/hosting
---

# Hosting

Want to host Kowl under a sub-path (instead of `/`)? Then this is the document you're looking for.

## Config Entries

There are 3 config entries that should cover most scenarios.
As you can see in [docs/config/kowl.yaml](../config/kowl.yaml) the config entries can be found in the `server:` group.

- `basePath`
    ---
    The sub-path under which Kowl will be hosted.
    If you have a proxy in front of Kowl that sets the `X-Forwarded-Prefix` header and you didn't disable the `setBasePathFromXForwardedPrefix` setting (enabled by default), then you don't need to set this.

    Default: not set / empty string

- `setBasePathFromXForwardedPrefix`  
    ---
    If true, Kowl will check the `X-Forwarded-Prefix` header on incoming requests, and if the header is present its value will be used as the path prefix.  
    That means if a request has `X-Forwarded-Prefix` set, the value set in the `basePath` setting will be ignored.

    Default: `true`

- `stripPrefix`  
    ---
    **Short Version**  
    If you're hosting Kowl on a sub-path and are using a reverse-proxy like Traefik with its "StripPrefix" middleware enabled, disable this setting!

    **Long Version**  
    Some proxies (like Traefik with its "StripPrefix" middleware) can remove a prefix from the URL path of an request before forwarding it. This can lead to a situation where both the proxy and Kowl will try to remove a prefix which *could* lead to issues.  
    If a prefix is set/used it **must** be removed at some point before reaching Kowls internal routing. We reccommend that only **one** part of the stack removes the prefix (even though a scenario where this is a problem is unlikely).
    So if you're using Traefik (or any other proxy that modifies the request path / URL) you should either set `stripPrefix: false` in Kowl, or configure the proxy so it doesn't modify the path of a request.

    See the example below for a setup where the double remocal is a problem.
  

    Default: `true`

## Example
For the curious, here is an example scenario that, albeit pretty contreived, should illustrate nicely how double removal could be a problem:

> - Traefik configured to route `/topics` to Kowl and enabled "StripPrefix" middleware
> - Kowl configured with the default settings
> - A user types the following address into their browser `example.com/topics/topics/example-topic`
> - Traefik sees the incoming request path `/topics/topics/example-topic`, sees that the prefix matches and removes it so the path becomes `/topics/example-topic`, and finally sets `/topics` in the `X-Forwarded-Prefix` header
> - The request reaches Kowl, which sees that `X-Forwarded-Prefix` is set and `setBasePathFromXForwardedPrefix` is true. So it tries to remove what it thinks is the prefix with the request path `/topics/example-topic` now becoming `/example-topic`
> - Kowl tries to find a handler for the route `/example-topic` but of course it won't find one.
