#!/usr/bin/env bash

cp ../../../../go/benthos/internal/docs/* .
rm json_schema.go benchmark_test.go bloblang_markdown.go
sed -i 's/github.com\/benthosdev\/benthos\/v4\/internal\/docs/dullploy\/blobstudio\/internal\/docs/g' ./*.go
