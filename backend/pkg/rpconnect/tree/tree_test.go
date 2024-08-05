package tree

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/lint"
)

func TestTreeLints(t *testing.T) {
	pipelineYAML := `
input:
  label: ""
  generate:
    mapping: root = {"message":"test","id":nanoid(),"timestamp_ms":timestamp_unix_micro(),"timestamp":now()}
    interval: "1s"
    count: 0
    batch_size: 1
    auto_replay_nacks: true

pipeline:
  processors:
    - bloblang: |
        root = this
        if root.message.types() == "string" {
          root.reversed = root.message.reverse()
        }
        
output:
  label: "rpconnect_gen_out"
  kafka_franz:
    seed_brokers: ['seed-b57eca9f.cqgpbhjq3qurtd7suqf0.fmc.ign.cloud.redpanda.com:9092']
    topic: "rpconnect-gen-out"
    tls:
      enabled: true
    sasl:
    - mechanism: SCRAM-SHA-256
      password: rpconnect
      username: rpconnect

cache_resources:
  - label: meower
    memory: {}

logger:
  level: INFO
`

	graph, err := NewGenerator()
	assert.NoError(t, err)

	linter, err := lint.NewLinter()
	require.NoError(t, err)

	lints, err := linter.LintYAMLConfig([]byte(pipelineYAML))
	require.NoError(t, err)

	stream, resources, err := graph.ConfigToTree([]byte(pipelineYAML), lints)
	require.NoError(t, err)

	assert.Len(t, stream, 3)
	assert.Len(t, resources, 1)

	streamTreeBytes, err := json.Marshal(stream)
	require.NoError(t, err)
	assert.JSONEq(t, `[
  {
    "label": "Input",
    "path": "",
    "children": [
      {
        "path": "/input",
        "kind": "input",
        "type": "generate",
        "line_start": 3,
        "line_end": 9
      }
    ],
    "line_start": 3,
    "line_end": 9
  },
  {
    "label": "Processors",
    "path": "",
    "children": [
      {
        "path": "/pipeline/processors/0",
        "kind": "processor",
        "type": "bloblang",
        "line_start": 13,
        "line_end": 17,
        "lint_errors": [
          "unrecognised method 'types':  == \""
        ]
      }
    ],
    "line_start": 13,
    "line_end": 17
  },
  {
    "label": "Output",
    "path": "",
    "children": [
      {
        "label": "rpconnect_gen_out",
        "path": "/output",
        "kind": "output",
        "type": "kafka_franz",
        "line_start": 20,
        "line_end": 29
      }
    ],
    "line_start": 20,
    "line_end": 29
  }
]`, string(streamTreeBytes))

	resourceTreeBytes, err := json.Marshal(resources)
	require.NoError(t, err)
	assert.JSONEq(t, `[
  {
    "label": "Cache Resources",
    "path": "",
    "children": [
      {
        "label": "meower",
        "path": "/cache_resources/0",
        "kind": "cache",
        "type": "memory",
        "line_start": 32,
        "line_end": 33
      }
    ],
    "line_start": 32,
    "line_end": 33
  }
]`, string(resourceTreeBytes))
}

func TestTreeBatchingProcessors(t *testing.T) {
	pipelineYAML := `
input:
  broker:
    inputs:
      - generate:
          mapping: 'root.id = uuid_v4()'
        processors:
          - label: aproc
            mapping: 'root.things = this.things.append("a")'
    batching:
      count: 10
      processors:
        - label: bproc
          mapping: 'root.things = this.things.append("b")'
  processors:
    - label: cproc
      mapping: 'root.things = this.things.append("c")'
`

	graph, err := NewGenerator()
	require.NoError(t, err)

	stream, _, err := graph.ConfigToTree([]byte(pipelineYAML), nil)
	require.NoError(t, err)

	streamTreeBytes, err := json.Marshal(stream)
	require.NoError(t, err)
	assert.JSONEq(t, `[
  {
    "label": "Input",
    "path": "",
    "children": [
      {
        "path": "/input",
        "kind": "input",
        "type": "broker",
        "children": [
          {
            "label": "batching processors",
            "path": "",
            "children": [
              {
                "label": "bproc",
                "path": "/input/broker/batching/processors/0",
                "kind": "processor",
                "type": "mapping",
                "line_start": 13,
                "line_end": 14
              }
            ],
            "line_start": 0,
            "line_end": 0
          },
          {
            "path": "/input/broker/inputs/0",
            "kind": "input",
            "type": "generate",
            "children": [
              {
                "label": "aproc",
                "path": "/input/broker/inputs/0/processors/0",
                "kind": "processor",
                "type": "mapping",
                "line_start": 8,
                "line_end": 9
              }
            ],
            "line_start": 5,
            "line_end": 9
          },
          {
            "label": "cproc",
            "path": "/input/processors/0",
            "kind": "processor",
            "type": "mapping",
            "line_start": 16,
            "line_end": 17
          }
        ],
        "line_start": 3,
        "line_end": 17
      }
    ],
    "line_start": 3,
    "line_end": 17
  }
]`, string(streamTreeBytes))
}

func TestTreeCustomLayouts(t *testing.T) {
	for _, test := range []struct {
		Name   string
		Input  string
		Output string
	}{
		{
			Name: "resource label",
			Input: `
pipeline:
  processors:
    - resource: foo
    - resource: bar
`,
			Output: `[
  {
    "label": "Processors",
    "path": "",
    "children": [
      {
        "label": "foo",
        "path": "/pipeline/processors/0",
        "kind": "processor",
        "type": "resource",
        "line_start": 4,
        "line_end": 4
      },
      {
        "label": "bar",
        "path": "/pipeline/processors/1",
        "kind": "processor",
        "type": "resource",
        "line_start": 5,
        "line_end": 5
      }
    ],
    "line_start": 4,
    "line_end": 5
  }
]`,
		},
		{
			Name: "switch processor",
			Input: `
pipeline:
  processors:
    - switch:
        - check: 'meow == "meow"'
          processors:
            - label: aproc
              mapping: 'root.things = this.things.append("a")'
        - check: 'meow == "woof"'
          processors:
            - label: bproc
              mapping: 'root.things = this.things.append("b")'
`,
			Output: `[
  {
    "label": "Processors",
    "path": "",
    "children": [
      {
        "path": "/pipeline/processors/0",
        "kind": "processor",
        "type": "switch",
        "grouped_children": [
          [
            {
              "label": "case 0",
              "path": "",
              "line_start": 0,
              "line_end": 0
            },
            {
              "label": "aproc",
              "path": "/pipeline/processors/0/switch/0/processors/0",
              "kind": "processor",
              "type": "mapping",
              "line_start": 7,
              "line_end": 8
            }
          ],
          [
            {
              "label": "case 1",
              "path": "",
              "line_start": 0,
              "line_end": 0
            },
            {
              "label": "bproc",
              "path": "/pipeline/processors/0/switch/1/processors/0",
              "kind": "processor",
              "type": "mapping",
              "line_start": 11,
              "line_end": 12
            }
          ]
        ],
        "line_start": 4,
        "line_end": 12
      }
    ],
    "line_start": 4,
    "line_end": 12
  }
]`,
		},
		{
			Name: "switch output",
			Input: `
output:
  switch:
    cases:
      - check: 'meow == "meow"'
        output:
          drop: {}
      - check: 'meow == "woof"'
        output:
          drop: {}
`,
			Output: `[
  {
    "label": "Output",
    "path": "",
    "children": [
      {
        "path": "/output",
        "kind": "output",
        "type": "switch",
        "children": [
          {
            "label": "case 0",
            "path": "",
            "children": [
              {
                "path": "/output/switch/cases/0/output",
                "kind": "output",
                "type": "drop",
                "line_start": 7,
                "line_end": 7
              }
            ],
            "line_start": 0,
            "line_end": 0
          },
          {
            "label": "case 1",
            "path": "",
            "children": [
              {
                "path": "/output/switch/cases/1/output",
                "kind": "output",
                "type": "drop",
                "line_start": 10,
                "line_end": 10
              }
            ],
            "line_start": 0,
            "line_end": 0
          }
        ],
        "line_start": 3,
        "line_end": 10
      }
    ],
    "line_start": 3,
    "line_end": 10
  }
]`,
		},
		{
			Name: "group processor",
			Input: `
pipeline:
  processors:
    - group_by:
        - check: 'meow == "meow"'
          processors:
            - label: aproc
              mapping: 'root.things = this.things.append("a")'
        - check: 'meow == "woof"'
          processors:
            - label: bproc
              mapping: 'root.things = this.things.append("b")'
`,
			Output: `[
  {
    "label": "Processors",
    "path": "",
    "children": [
      {
        "path": "/pipeline/processors/0",
        "kind": "processor",
        "type": "group_by",
        "grouped_children": [
          [
            {
              "label": "group 0",
              "path": "",
              "line_start": 0,
              "line_end": 0
            },
            {
              "label": "aproc",
              "path": "/pipeline/processors/0/group_by/0/processors/0",
              "kind": "processor",
              "type": "mapping",
              "line_start": 7,
              "line_end": 8
            }
          ],
          [
            {
              "label": "group 1",
              "path": "",
              "line_start": 0,
              "line_end": 0
            },
            {
              "label": "bproc",
              "path": "/pipeline/processors/0/group_by/1/processors/0",
              "kind": "processor",
              "type": "mapping",
              "line_start": 11,
              "line_end": 12
            }
          ]
        ],
        "line_start": 4,
        "line_end": 12
      }
    ],
    "line_start": 4,
    "line_end": 12
  }
]`,
		},
	} {
		test := test
		t.Run(test.Name, func(t *testing.T) {
			graph, err := NewGenerator()
			require.NoError(t, err)

			stream, _, err := graph.ConfigToTree([]byte(test.Input), nil)
			require.NoError(t, err)

			streamTreeBytes, err := json.Marshal(stream)
			require.NoError(t, err)
			assert.JSONEq(t, test.Output, string(streamTreeBytes))
		})
	}
}

var foo = []interface{}{map[string]interface{}{
	"children": []interface{}{map[string]interface{}{"kind": "input", "line_end": 9, "line_start": 3, "path": "/input", "type": "generate"}},
	"label":    "Input", "line_end": 9, "line_start": 3, "path": "",
},
	map[string]interface{}{
		"children": []interface{}{map[string]interface{}{"kind": "processor", "line_end": 17, "line_start": 13, "lint_errors": []interface{}{"unrecognised method 'types':  == \""}, "path": "/pipeline/processors/0", "type": "bloblang"}},
		"label":    "Processors", "line_end": 17, "line_start": 13, "path": "",
	},
	map[string]interface{}{
		"children": []interface{}{map[string]interface{}{"kind": "output", "label": "rpconnect_gen_out", "line_end": 29, "line_start": 20, "path": "/output", "type": "kafka_franz"}},
		"label":    "Output", "line_end": 29, "line_start": 20, "path": "",
	}}

var bar = []interface{}{map[string]interface{}{
	"children": []interface{}{map[string]interface{}{"kind": "processor", "line_end": 17, "line_start": 13, "lint_errors": []interface{}{"unrecognised method 'types':  == \""}, "path": "/pipeline/processors/0", "type": "bloblang"}},
	"label":    "Processors", "line_end": 17, "line_start": 13, "path": "",
},
	map[string]interface{}{
		"children": []interface{}{map[string]interface{}{"kind": "output", "label": "rpconnect_gen_out", "line_end": 29, "line_start": 20, "path": "/output", "type": "kafka_franz"}},
		"label":    "Output", "line_end": 29, "line_start": 20, "path": "",
	},
	map[string]interface{}{
		"children": []interface{}{map[string]interface{}{"kind": "input", "line_end": 9, "line_start": 3, "path": "/input", "type": "generate"}},
		"label":    "Input", "line_end": 9, "line_start": 3, "path": "",
	}}
