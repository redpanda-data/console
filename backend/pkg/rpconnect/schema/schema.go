package schema

import _ "embed"

// This schema is generated with the command:
// benthos list --format json-full-scrubbed > ./data/schema.json
//
//go:embed data/schema.json
var SchemaBytes []byte
