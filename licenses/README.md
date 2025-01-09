# FAQ

There are 2 licenses for Redpanda. BSL covers our core and RCL (Redpanda Community License)
which covers enterprise features.

1. [BSL](https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md): 
The intent as we mentioned in our [blog post](https://redpanda.com/blog/open-source/)
is to allow any use of the none enterprise features Redpanda unless you want to
offer Redpanda as a service. The license will at some point in the future (change date) become Apache 2.

2. [RCL](https://github.com/redpanda-data/redpanda/blob/dev/licenses/rcl.md): 
Redpanda Community License - is intended to allow you to use enterprise features
that you pay for.

We thank MariaDB and CockroachDB for pioneering the use of BSL for storage systems.
It gave us a path to build an infrastructure company in the age of the hyperclouds.

## How to recreate the third party licenses files

Third party licenses audit files are generated on demand, the steps to do so are documented below.

1. backend run `task backend:licenses:third-party`
2. frontend:
    * `cd frontend`
    * `npx license-checker --csv --production > ../licenses/third_party_js.csv`

