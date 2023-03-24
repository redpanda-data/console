package interceptor

func ConsoleToKafkaConnectBigQueryHook(config map[string]any) map[string]any {
	_, exists := config["keySource"]
	if !exists {
		config["keySource"] = "JSON"
	}

	return config
}
