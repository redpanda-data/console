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
				Importance:    model.ConfigDefinitionImportanceMedium,
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
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "database.instance",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceMedium,
				Required:      false,
				DisplayName:   "Database instance",
				Documentation: "Specifies the instance name of the SQL Server named instance. If both `Port` and `Database instance` are specified, `Database instance` is ignored",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "database.instance",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "database.encrypt",
				Type:          "BOOLEAN",
				DefaultValue:  "true",
				Importance:    model.ConfigDefinitionImportanceMedium,
				Required:      false,
				DisplayName:   "Database encryption",
				Documentation: "By default, JDBC connections to Microsoft SQL Server are protected by SSL encryption. If SSL is not enabled for a SQL Server database, or if you want to connect to the database without using SSL, you can disable SSL",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "database.encrypt",
				Value:             "true",
				RecommendedValues: []string{"true", "false"},
				Visible:           true,
				Errors:            []string{},
			},
		})

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJSONSchemaHook(response, config), config)
}

// ConsoleToKafkaConnectDebeziumSQLServerConfigsHook sets tasks max always to exactly one task
func ConsoleToKafkaConnectDebeziumSQLServerConfigsHook(userReq map[string]any) map[string]any {
	return userReq
}
