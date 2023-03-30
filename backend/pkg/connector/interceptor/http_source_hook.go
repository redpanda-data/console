package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleHttpSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "kafka.topic",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      true,
			DisplayName:   "Topic",
			Documentation: "Name of the topic where the record will be sent to.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "kafka.topic",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.url",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      true,
			DisplayName:   "HTTP URL",
			Documentation: "HTTP URL to use in the request.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.url",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.headers",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP request headers",
			Documentation: "HTTP headers to use in the request, comma separated list of : separated pairs. Example: 'Name:Value,Name2:Value2'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.headers",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.method",
			Type:          "STRING",
			DefaultValue:  "GET",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP method",
			Documentation: "HTTP method to use in the request. Default: GET",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.method",
			Value:             "GET",
			RecommendedValues: []string{"GET", "POST", "PUT", "HEAD", "DELETE", "PATCH"},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.params",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "HTTP request params",
			Documentation: "HTTP query parameters to use in the request. & separated list of = separated pairs. Example: 'name=value&name2=value2'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.params",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.auth.type",
			Type:          "STRING",
			DefaultValue:  "None",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "Authentication type",
			Documentation: "Type of authentication.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.type",
			Value:             "None",
			RecommendedValues: []string{"None", "Basic"},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.auth.user",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "User",
			Documentation: "Basic authentication user.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.user",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           isBasicAuthEnabled(config),
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.auth.password",
			Type:          "PASSWORD",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "Password",
			Documentation: "Basic authentication password.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.password",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           isBasicAuthEnabled(config),
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.list.pointer",
			Type:          "STRING",
			DefaultValue:  "/",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response list pointer",
			Documentation: "JsonPointer to the property in the response body containing an array of records. Example: /items",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.list.pointer",
			Value:             "/",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.offset.pointer",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record offset pointer",
			Documentation: "Comma separated list of key=/value pairs where the key is the name of the property in the offset, and the value is the JsonPointer to the value being used as offset for future requests.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.record.offset.pointer",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.timer.interval.millis",
			Type:          "LONG",
			DefaultValue:  "60000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP timer interval",
			Documentation: "Interval in between requests when up-to-date in milliseconds.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.timer.interval.millis",
			Value:             "60000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.timer.catchup.interval.millis",
			Type:          "LONG",
			DefaultValue:  "60000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP timer catchup interval",
			Documentation: "Interval in between requests when catching up in milliseconds.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.timer.catchup.interval.millis",
			Value:             "30000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.client.connection.timeout.millis",
			Type:          "LONG",
			DefaultValue:  "2000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP client connection timeout",
			Documentation: "Timeout for opening a connection in milliseconds.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.client.connection.timeout.millis",
			Value:             "2000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.client.read.timeout.millis",
			Type:          "LONG",
			DefaultValue:  "2000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Read timeout",
			Documentation: "Timeout for reading a response in milliseconds.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.client.read.timeout.millis",
			Value:             "2000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.policy.codes.skip",
			Type:          "STRING",
			DefaultValue:  "300..399",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response codes skipping policy",
			Documentation: "Comma separated list of code ranges that will result in the parser skipping the response. Example: '300..305, 307..310'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.policy.codes.skip",
			Value:             "300..399",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.policy.codes.process",
			Type:          "STRING",
			DefaultValue:  "200..299",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response codes process policy",
			Documentation: "Comma separated list of code ranges that will result in the parser processing the response. Example: `200..205, 207..210`",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.policy.codes.process",
			Value:             "200..299",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.mapper",
			Type:          "CLASS",
			DefaultValue:  "com.github.castorm.kafka.connect.http.record.SchemedKvSourceRecordMapper",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record mapper",
			Documentation: "'SchemedKvSourceRecordMapper' maps key to a Struct schema with a single property key and value to a Struct schema with a single property value. 'StringKvSourceRecordMapper' maps both key and value to a String schema.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.record.mapper",
			Value:             "com.github.castorm.kafka.connect.http.record.SchemedKvSourceRecordMapper",
			RecommendedValues: []string{"com.github.castorm.kafka.connect.http.record.SchemedKvSourceRecordMapper", "com.github.castorm.kafka.connect.http.record.StringKvSourceRecordMapper"},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.list.order.direction",
			Type:          "STRING",
			DefaultValue:  "IMPLICIT",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response list order direction",
			Documentation: "Order direction of the results in the response list. Default: IMPLICIT",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.list.order.direction",
			Value:             "IMPLICIT",
			RecommendedValues: []string{"ASC", "DESC", "IMPLICIT"},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.timestamp.parser",
			Type:          "CLASS",
			DefaultValue:  "com.github.castorm.kafka.connect.http.response.timestamp.EpochMillisOrDelegateTimestampParser",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record timestamp parser",
			Documentation: "Class responsible for converting the timestamp property captured above into a java.time.Instant.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:  "http.response.record.timestamp.parser",
			Value: "com.github.castorm.kafka.connect.http.response.timestamp.EpochMillisOrDelegateTimestampParser",
			RecommendedValues: []string{"com.github.castorm.kafka.connect.http.response.timestamp.EpochMillisTimestampParser",
				"com.github.castorm.kafka.connect.http.response.timestamp.EpochMillisOrDelegateTimestampParser",
				"com.github.castorm.kafka.connect.http.response.timestamp.DateTimeFormatterTimestampParser",
				"com.github.castorm.kafka.connect.http.response.timestamp.NattyTimestampParser",
				"com.github.castorm.kafka.connect.http.response.timestamp.RegexTimestampParser",
			},
			Visible: true,
			Errors:  []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.body",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP request body",
			Documentation: "HTTP body to use in the request.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.body",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.client.connection.ttl.millis",
			Type:          "LONG",
			DefaultValue:  "300000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Time to live for the connection",
			Documentation: "",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.client.connection.ttl.millis",
			Value:             "300000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.timestamp.parser.zone",
			Type:          "STRING",
			DefaultValue:  "UTC",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record timestamp zone",
			Documentation: "Timezone of the timestamp. Accepts java.time.ZoneId valid identifiers. Default: UTC",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.record.timestamp.parser.zone",
			Value:             "UTC",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.timestamp.parser.pattern",
			Type:          "STRING",
			DefaultValue:  "yyyy-MM-dd'T'HH:mm:ss[.SSS]X",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record timestamp parser pattern",
			Documentation: "When using DateTimeFormatterTimestampParser, a custom pattern can be specified. Default: yyyy-MM-dd'T'HH:mm:ss[.SSS]X",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.record.timestamp.parser.pattern",
			Value:             "yyyy-MM-dd'T'HH:mm:ss[.SSS]X",
			RecommendedValues: []string{},
			Visible:           isParserClassSelected(config, "com.github.castorm.kafka.connect.http.response.timestamp.DateTimeFormatterTimestampParser"),
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.timestamp.parser.regex",
			Type:          "STRING",
			DefaultValue:  ".*",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record timestamp parser regex",
			Documentation: "When using RegexTimestampParser, a custom regex pattern can be specified. Default: .*",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.record.timestamp.parser.regex",
			Value:             ".*",
			RecommendedValues: []string{},
			Visible:           isParserClassSelected(config, "com.github.castorm.kafka.connect.http.response.timestamp.RegexTimestampParser"),
			Errors:            []string{},
		},
	})

	return KafkaConnectToConsoleJsonSchemaHook(KafkaConnectToConsoleTopicCreationHook(response, config), config)
}

func isBasicAuthEnabled(configs map[string]any) bool {
	config, exists := configs["http.auth.type"]
	if exists {
		return config == "Basic"
	}

	return false
}

func isParserClassSelected(configs map[string]any, parserClass string) bool {
	config, exists := configs["http.response.record.timestamp.parser"]
	if exists {
		return config == parserClass
	}

	return false
}
