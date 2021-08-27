---
title: Kafka Connect
path: /docs/features/kafka-connect
---

# Kafka Connect

Kowl provides a user interface that enables you to manage multiple Kafka connect clusters
via a user interface. You can inspect the configured connectors, configure them, restart/pause/resume
connectors and also delete them if desired. If you have more than one cluster configured some requests
(such as listing connectors) will query all configured connect clusters and Kowl will aggregate the results
so that you can see them in one spot.

## Configuration

Below sample configuration can be put at the root level. For each cluster you have to provide at
least a unique name, the HTTP address of the cluster, and the authentication settings if required.
All available configuration options can be found in the [reference config](/docs/config/kowl.yaml).

```yaml
connect:
  enabled: true
  clusters:
    - name: datawarehouse # Required field, will be used as identifier in the frontend
      url: http://dwh-connect.mycompany.com:8083
      tls:
        enabled: false # Trusted certs are still allowed by default
      username: admin
      # password: # Set via flag --connect.clusters.0.password=secret
    - name: analytics # Required field, will be used as identifier in the frontend
      url: http://analytics.mycompany.com:8083
      # No auth configured on that cluster, hence no username/password set
```
