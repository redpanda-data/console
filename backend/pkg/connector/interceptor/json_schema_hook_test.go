package interceptor

import (
	"reflect"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func TestKafkaConnectToConsoleJSONSchemaHook(t *testing.T) {
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
			name: "Should pass validation response for non-Json",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "header.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "header.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "header.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message header JSON contains schema",
							Documentation: "Whether your message header contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "header.converter.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show schemas.enable for json",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "org.apache.kafka.connect.json.JsonConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "org.apache.kafka.connect.json.JsonConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "header.converter",
								Value: "org.apache.kafka.connect.json.JsonConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "org.apache.kafka.connect.json.JsonConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "org.apache.kafka.connect.json.JsonConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "header.converter",
							Value: "org.apache.kafka.connect.json.JsonConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "header.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message header JSON contains schema",
							Documentation: "Whether your message header contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "header.converter.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show schemas.enable and set proper schemas enabled",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "org.apache.kafka.connect.json.JsonConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "org.apache.kafka.connect.json.JsonConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "header.converter",
								Value: "org.apache.kafka.connect.json.JsonConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{
					"key.converter.schemas.enable":    "false",
					"value.converter.schemas.enable":  "false",
					"header.converter.schemas.enable": "false",
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "org.apache.kafka.connect.json.JsonConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "org.apache.kafka.connect.json.JsonConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "header.converter",
							Value: "org.apache.kafka.connect.json.JsonConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.schemas.enable",
							Value:             "false",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.schemas.enable",
							Value:             "false",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "header.converter.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message header JSON contains schema",
							Documentation: "Whether your message header contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "header.converter.schemas.enable",
							Value:             "false",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := KafkaConnectToConsoleJSONSchemaHook(tt.args.response, tt.args.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("KafkaConnectToConsoleJSONSchemaHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
