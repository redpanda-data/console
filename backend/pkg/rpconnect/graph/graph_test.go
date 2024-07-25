package graph

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"gopkg.in/yaml.v3"

	"github.com/redpanda-data/console/backend/pkg/rpconnect/lint"
)

const pipelineYAML = `
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
        if root.message.type() == "string" {
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
`

func TestConfigToTree(t *testing.T) {
	graph, err := NewGraphGenerator()
	assert.NoError(t, err)

	var confNode yaml.Node
	err = yaml.Unmarshal([]byte(pipelineYAML), &confNode)
	assert.NoError(t, err)

	linter, err := lint.NewLinter()
	assert.NoError(t, err)

	lints := linter.LintYAML([]byte(pipelineYAML))
	assert.NoError(t, err)

	fmt.Println("lints:")
	lj, _ := json.Marshal(lints)
	fmt.Println(string(lj))

	stream, resources, err := graph.ConfigToTree(confNode, lints)
	assert.NoError(t, err)

	sj, _ := json.Marshal(stream)
	fmt.Println("stream:")
	fmt.Println(string(sj))

	rj, _ := json.Marshal(resources)
	fmt.Println("resources:")
	fmt.Println(string(rj))

	// assert.Fail(t, "asdf")
}
