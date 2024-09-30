package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

// KafkaConnectToConsoleDebeziumSQLServerSourceHook adds MSSQL Server Debezium source specific config options
// missing in Validate Kafka Connect response
func KafkaConnectToConsoleDebeziumSQLServerSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs,
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

// ConsoleToKafkaConnectDebeziumSQLServerConfigsHook sets tasks max always to exactly one task
func ConsoleToKafkaConnectDebeziumSQLServerConfigsHook(userReq map[string]any) map[string]any {
	userReq["tasks.max"] = "1"
	return userReq
}
