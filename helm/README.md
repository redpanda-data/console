# Redpanda Console Helm Chart

This Helm chart allows you to deploy Redpanda Console to your Redpanda cluster.
You can install the chart by running the following commands:

```shell
helm repo add redpanda-console 'https://packages.vectorized.io/public/console/helm/charts/' 
helm repo update
helm install redpanda-console/console -f values.yaml
```

Have a look at the [values.yaml](./console/values.yaml) file to see the available options.
Additionally, there is an example configuration in the [examples](./examples) directory.
