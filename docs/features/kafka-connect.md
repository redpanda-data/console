---
title: Kafka Connect
path: /docs/features/kafka-connect
---

# Kafka Connect

Kowl provides a user interface that enables you to manage multiple Kafka connect clusters
via a user interface. You can inspect the configured connectors, configure them, restart/pause/resume
connectors and also delete them if desired. If you have more than one cluster configured some requests
(such as listing connectors) will query all configured connect clusters and aggregate the results
so that you can see them in one spot.

## Configuration

Below sample configuration can be put at the root level. 

```yaml
connect:
  enabled: false
  clusters:
    - name: datawarehouse # Required field, will be used as identifier in the frontend
      url: http://dwh-connect.mycompany.com:8083
      tls:
        enabled: false # Trusted certs are still allowed by default
      username: admin
      # password: # Set via flag --connect.clusters.0.password=secret
    - name: analytics # Required field, will be used as identifier in the frontend
      url: http://analytics.mycompany.com:8083
      tls:
        enabled: false # Trusted certs are still allowed by default
      username: admin
      # password: # Set via flag --connect.clusters.0.password=secret
```
