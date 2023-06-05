package guide

import (
	"reflect"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func TestDefaultGuide_ConsoleToKafkaConnect(t *testing.T) {
	g := &DefaultGuide{}

	tests := []struct {
		name    string
		configs map[string]any
		want    map[string]any
	}{
		{
			name:    "Add placeholder for topics.regex for sink connector",
			configs: map[string]any{"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector"},
			want: map[string]any{
				"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector",
				"topics.regex":    "__TOPICS_REGEX_PLACEHOLDER",
			},
		},
		{
			name: "Do not add placeholder for topics.regex for sink connector when topics present",
			configs: map[string]any{
				"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector",
				"topics":          "topic",
			},
			want: map[string]any{
				"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector",
				"topics":          "topic",
			},
		},
		{
			name: "Do not add placeholder for topics.regex for sink connector when topics.regex present",
			configs: map[string]any{
				"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector",
				"topics.regex":    "regexp",
			},
			want: map[string]any{
				"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector",
				"topics.regex":    "regexp",
			},
		},
		{
			name:    "Do not add placeholder for topics.regex for source connector",
			configs: map[string]any{"connector.class": "com.mongodb.kafka.connect.MongoSourceConnector"},
			want: map[string]any{
				"connector.class": "com.mongodb.kafka.connect.MongoSourceConnector",
			},
		},
		{
			name:    "Do not add placeholder for topics.regex for mirror source connector",
			configs: map[string]any{"connector.class": "org.apache.kafka.connect.mirror.MirrorSourceConnector"},
			want: map[string]any{
				"connector.class": "org.apache.kafka.connect.mirror.MirrorSourceConnector",
			},
		},
		{
			name:    "Do not add placeholder for topics.regex for mirror checkpoint connector",
			configs: map[string]any{"connector.class": "org.apache.kafka.connect.mirror.MirrorCheckpointConnector"},
			want: map[string]any{
				"connector.class": "org.apache.kafka.connect.mirror.MirrorCheckpointConnector",
			},
		},
		{
			name:    "Do not add placeholder for topics.regex for mirror heartbeat connector",
			configs: map[string]any{"connector.class": "org.apache.kafka.connect.mirror.MirrorHeartbeatConnector"},
			want: map[string]any{
				"connector.class": "org.apache.kafka.connect.mirror.MirrorHeartbeatConnector",
			},
		},
		{
			name:    "Do not add placeholder for topics.regex for debezium postgres connector",
			configs: map[string]any{"connector.class": "io.debezium.connector.postgresql.PostgresConnector"},
			want: map[string]any{
				"connector.class": "io.debezium.connector.postgresql.PostgresConnector",
			},
		},
		{
			name:    "Do not add placeholder for topics.regex for debezium mysql connector",
			configs: map[string]any{"connector.class": "io.debezium.connector.mysql.MySqlConnector"},
			want: map[string]any{
				"connector.class": "io.debezium.connector.mysql.MySqlConnector",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := g.ConsoleToKafkaConnect(tt.configs); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ConsoleToKafkaConnect() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestDefaultGuide_KafkaConnectToConsole(t *testing.T) {
	g := &DefaultGuide{}
	type args struct {
		pluginClassName string
		patchedConfigs  []model.ConfigDefinition
		originalConfig  map[string]any
	}
	tests := []struct {
		name string
		args args
		want model.ValidationResponse
	}{
		{
			name: "Should remove topics.regex placeholder value",
			args: args{
				pluginClassName: "com.redpanda.kafka.connect.s3.S3SinkConnector",
				patchedConfigs: []model.ConfigDefinition{
					{
						Definition: model.ConfigDefinitionKey{
							Name: "connector.class",
						}, Value: model.ConfigDefinitionValue{
							Name:  "connector.class",
							Value: "com.redpanda.kafka.connect.s3.S3SinkConnector",
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name: "topics.regex",
						}, Value: model.ConfigDefinitionValue{
							Name:  "topics.regex",
							Value: "__TOPICS_REGEX_PLACEHOLDER",
						},
					},
				},
				originalConfig: map[string]any{
					"connector.class": "com.redpanda.kafka.connect.s3.S3SinkConnector",
					"topics.regex":    "__TOPICS_REGEX_PLACEHOLDER",
				},
			},
			want: model.ValidationResponse{
				Name: "com.redpanda.kafka.connect.s3.S3SinkConnector",
				Configs: []model.ConfigDefinition{
					{
						Definition: model.ConfigDefinitionKey{Name: "connector.class"},
						Value: model.ConfigDefinitionValue{
							Name:  "connector.class",
							Value: "com.redpanda.kafka.connect.s3.S3SinkConnector",
						},
					},
					{
						Definition: model.ConfigDefinitionKey{Name: "topics.regex"},
						Value: model.ConfigDefinitionValue{
							Name:  "topics.regex",
							Value: "",
						},
					},
				},
				Steps: []model.ValidationResponseStep{
					{
						Name:        "General",
						Description: "",
						Groups: []model.ValidationResponseStepGroup{
							{
								ConfigKeys: []string{"connector.class", "topics.regex"},
							},
						},
					},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := g.KafkaConnectToConsole(tt.args.pluginClassName, tt.args.patchedConfigs, tt.args.originalConfig); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("KafkaConnectToConsole() = %v, want %v", got, tt.want)
			}
		})
	}
}
