package interceptor

// ConsoleToKafkaConnectBigQueryHook adds keySource property explicitly in Console to Kafka Connect request
func ConsoleToKafkaConnectBigQueryHook(config map[string]any) map[string]any {
	_, exists := config["keySource"]
	if !exists {
		config["keySource"] = "JSON"
	}

	_, exists = config["bigQueryPartitionDecorator"]
	if !exists {
		config["bigQueryPartitionDecorator"] = "false"
	}

	return config
}
