package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// KafkaConnectToConsoleDebeziumPostgresSourceHook adds Postgres Debezium source specific config options
// missing in Validate Kafka Connect response
func KafkaConnectToConsoleDebeziumPostgresSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "money.fraction.digits",
			Type:          "SHORT",
			DefaultValue:  "2",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Money fraction digits",
			Documentation: "Number of fractional digits when money type is converted to 'precise' decimal number",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "money.fraction.digits",
			Value:             "2",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "producer.override.max.request.size",
				Type:          "INT",
				DefaultValue:  "1048576",
				Importance:    "MEDIUM",
				Required:      false,
				DisplayName:   "Max size of a request",
				Documentation: "The maximum size of a request in bytes. This setting will limit the number of record batches the producer will send in a single request to avoid sending huge requests. This is also effectively a cap on the maximum uncompressed record batch size. Note that the server has its own cap on the record batch size (after compression if compression is enabled) which may be different from this. The default is 1048576",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "producer.override.max.request.size",
				Value:             "1048576",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		})

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJSONSchemaHook(response, config), config)
}

// ConsoleToKafkaConnectDebeziumPostgresConfigsHook sets tasks max always to exactly one task
func ConsoleToKafkaConnectDebeziumPostgresConfigsHook(userReq map[string]any) map[string]any {
	userReq["tasks.max"] = "1"
	return userReq
}
