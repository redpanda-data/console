// Package schema provides our embedded Redpanda Connect Schema
package schema

import _ "embed"

// SchemaBytes is the schema is generated with the command:
// benthos list --format json-full-scrubbed > ./data/schema.json
//
//go:embed data/schema.json
var SchemaBytes []byte
