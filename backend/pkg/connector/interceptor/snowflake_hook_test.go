package interceptor

import (
	"reflect"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func TestKafkaConnectToConsoleSnowflakeHook(t *testing.T) {
	type args struct {
		response model.ValidationResponse
		config   map[string]any
	}
	tests := []struct {
		name string
		args args
		want model.ValidationResponse
	}{
		{
			name: "Should pass validation response",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key",
								Value: "value",
							},
						},
					},
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key",
							Value: "value",
						},
					},
				},
			},
		},
		{
			name: "Should allow snowpipe streaming for StringConverter",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "snowflake.ingestion.method",
								Value: "snowpipe_streaming",
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "org.apache.kafka.connect.storage.StringConverter",
							},
						},
					},
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "snowflake.ingestion.method",
							Value: "snowpipe_streaming",
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "org.apache.kafka.connect.storage.StringConverter",
						},
					},
				},
			},
		},
		{
			name: "Should not allow snowpipe streaming for non-StringConverter",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "snowflake.ingestion.method",
								Value: "snowpipe_streaming",
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "com.snowflake.kafka.connector.records.SnowflakeJsonConverter",
							},
						},
					},
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "snowflake.ingestion.method",
							Value: "snowpipe_streaming",
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:   "value.converter",
							Value:  "com.snowflake.kafka.connector.records.SnowflakeJsonConverter",
							Errors: []string{"For SNOWPIPE_STREAMING only STRING converter can be used"},
						},
					},
				},
			},
		},
		{
			name: "Should allow snowpipe for non-StringConverter",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "snowflake.ingestion.method",
								Value: "snowpipe",
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "com.snowflake.kafka.connector.records.SnowflakeJsonConverter",
							},
						},
					},
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "snowflake.ingestion.method",
							Value: "snowpipe",
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "com.snowflake.kafka.connector.records.SnowflakeJsonConverter",
						},
					},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := KafkaConnectToConsoleSnowflakeHook(tt.args.response, tt.args.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("KafkaConnectToConsoleSnowflakeHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
