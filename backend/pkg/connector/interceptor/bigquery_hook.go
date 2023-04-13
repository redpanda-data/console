package interceptor

// ConsoleToKafkaConnectBigQueryHook sets the keySource property to JSON explicitly, making JSON the only way of
// providing the Google key in the wizard, and sets bigQueryPartitionDecorator explicitly to false, to allow using
// various table partitioning types on the BigQuery side
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
