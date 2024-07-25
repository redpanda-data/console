package docs_test

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/docs"
)

func TestSetYAMLForceLabels(t *testing.T) {
	mockProv := docs.NewMappedDocsProvider()
	mockProv.RegisterDocs(docs.ComponentSpec{
		Name: "kafka",
		Type: docs.TypeInput,
		Config: docs.FieldComponent().WithChildren(
			docs.FieldString("addresses", "").Array(),
			docs.FieldString("topics", "").Array(),
		),
	})
	mockProv.RegisterDocs(docs.ComponentSpec{
		Name: "generate",
		Type: docs.TypeInput,
		Config: docs.FieldComponent().WithChildren(
			docs.FieldString("mapping", ""),
		),
	})
	mockProv.RegisterDocs(docs.ComponentSpec{
		Name: "dynamic",
		Type: docs.TypeInput,
		Config: docs.FieldComponent().WithChildren(
			docs.FieldInput("inputs", "").Map(),
		),
	})
	mockProv.RegisterDocs(docs.ComponentSpec{
		Name: "nats",
		Type: docs.TypeOutput,
		Config: docs.FieldComponent().WithChildren(
			docs.FieldString("urls", "").Array(),
			docs.FieldString("subject", ""),
			docs.FieldInt("max_in_flight", ""),
		),
	})
	mockProv.RegisterDocs(docs.ComponentSpec{
		Name: "compress",
		Type: docs.TypeProcessor,
		Config: docs.FieldComponent().WithChildren(
			docs.FieldString("algorithm", ""),
		),
	})
	mockProv.RegisterDocs(docs.ComponentSpec{
		Name: "switch",
		Type: docs.TypeProcessor,
		Config: docs.FieldComponent().Array().WithChildren(
			docs.FieldString("check", ""),
			docs.FieldProcessor("processors", "").Array(),
		),
	})

	tests := []struct {
		name   string
		input  string
		output string
	}{
		{
			name: "simple input/output",
			input: `input:
  kafka:
    addresses: ["foo", "bar"]
    topics: ["baz"]
output:
  nats:
    urls: ["nats://127.0.0.1:4222"]
    subject: benthos_messages
    max_in_flight: 1
`,
			output: `input:
  kafka:
    addresses: ["foo", "bar"]
    topics: ["baz"]
  label: /input
output:
  nats:
    urls: ["nats://127.0.0.1:4222"]
    subject: benthos_messages
    max_in_flight: 1
  label: /output
`,
		},
		{
			name: "mixed labels and no labels",
			input: `input:
  dynamic:
    inputs:
      foo:
        kafka:
          addresses: ["foo", "bar"]
          topics: ["baz"]
      bar:
        label: mygenerate
        generate: {}
pipeline:
  processors:
    - compress: {}
    - switch:
        - check: 'root = true'
          processors:
            - compress: {}
output:
  nats:
    urls: ["nats://127.0.0.1:4222"]
    subject: benthos_messages
    max_in_flight: 1
`,
			output: `input:
  dynamic:
    inputs:
      foo:
        kafka:
          addresses: ["foo", "bar"]
          topics: ["baz"]
        label: /input/dynamic/inputs/foo
      bar:
        label: mygenerate
        generate: {}
  label: /input
pipeline:
  processors:
    - compress: {}
      label: /pipeline/processors/0
    - switch:
        - check: 'root = true'
          processors:
            - compress: {}
              label: /pipeline/processors/1/switch/0/processors/0
      label: /pipeline/processors/1
output:
  nats:
    urls: ["nats://127.0.0.1:4222"]
    subject: benthos_messages
    max_in_flight: 1
  label: /output
`,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			res, err := docs.YAMLConfigForceLabels(configSpec, test.input, mockProv)

			var cbytes bytes.Buffer
			enc := yaml.NewEncoder(&cbytes)
			enc.SetIndent(2)
			require.NoError(t, enc.Encode(res))

			require.NoError(t, err)
			assert.Equal(t, test.output, cbytes.String())
		})
	}
}
