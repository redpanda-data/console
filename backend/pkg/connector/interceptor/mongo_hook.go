package interceptor

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

const (
	passwordPlaceholder = "__PASSWORD_PLACEHOLDER"
)

var (
	configProviderRegex           = regexp.MustCompile(`\${.+:.*:.+}`)
	hasKafkaConnectConfigProvider = configProviderRegex.MatchString
)

// ConsoleToKafkaConnectMongoDBHook sets connection authentication, output format properties and post processor chain
func ConsoleToKafkaConnectMongoDBHook(config map[string]any) map[string]any {
	setConnectionURI(config)
	for _, field := range []string{"key", "value"} {
		if config["output.format."+field] == nil {
			if v := getFormatOutputString(config[field+".converter"]); v != "" {
				config["output.format."+field] = v
			}
		}
	}
	config["post.processor.chain"] = getPostProcessorChain(config["post.processor.chain"], config["key.projection.type"], config["value.projection.type"], config["field.renamer.mapping"])

	return config
}

// KafkaConnectToConsoleMongoDBHook removes MongoDB specific config options
func KafkaConnectToConsoleMongoDBHook(config map[string]string) map[string]string {
	result := make(map[string]string)
	for key, value := range config {
		switch key {
		case "output.format.key":
			if value == getFormatOutputString(config["key.converter"]) {
				continue
			}
		case "output.format.value":
			if value == getFormatOutputString(config["value.converter"]) {
				continue
			}
		case "post.processor.chain":
			if value == getPostProcessorChain(nil, config["key.projection.type"], config["value.projection.type"], config["field.renamer.mapping"]) {
				continue
			}
		}

		result[key] = value
	}

	return result
}

func setConnectionURI(config map[string]any) {
	if _, exists := config["connection.uri"]; !exists {
		if _, exists := config["connection.url"]; exists {
			config["connection.uri"] = config["connection.url"]
		} else {
			config["connection.uri"] = "mongodb://"
		}
	}

	if config["connection.username"] != nil && config["connection.password"] != nil && config["connection.url"] != nil {
		//nolint:unchecked-type-assertion,revive // Empty password is handled
		password, _ := config["connection.password"].(string)
		if hasKafkaConnectConfigProvider(config["connection.password"].(string)) {
			password = passwordPlaceholder
		}
		if hasKafkaConnectConfigProvider(config["connection.url"].(string)) {
			config["connection.url"] = configProviderRegex.ReplaceAllString(config["connection.url"].(string), passwordPlaceholder)
		}

		u, e := url.Parse(config["connection.url"].(string))
		if e == nil {
			u.User = nil
			config["connection.url"] = u.String()
			u.User = url.UserPassword(config["connection.username"].(string), password)
			config["connection.uri"] = u.String()

			if hasKafkaConnectConfigProvider(config["connection.password"].(string)) {
				config["connection.uri"] = strings.ReplaceAll(config["connection.uri"].(string), passwordPlaceholder, config["connection.password"].(string))
			}
		}
	}
}

func getFormatOutputString(converter any) string {
	switch converter {
	case "org.apache.kafka.connect.json.JsonConverter",
		"io.confluent.connect.avro.AvroConverter":
		return "schema"
	case "org.apache.kafka.connect.storage.StringConverter":
		return "json"
	case "org.apache.kafka.connect.converters.ByteArrayConverter":
		return "bson"
	}

	return ""
}

func getPostProcessorChain(postProcessorChain any, keyProjectionType any, valueProjectionType any, fieldRenamerMapping any) string {
	var postProcessorChainResult string
	postProcessorChainStr, ok := postProcessorChain.(string)
	if ok {
		postProcessorChainResult = postProcessorChainStr
	} else {
		postProcessorChainResult = "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder"
	}

	switch keyProjectionType {
	case "allowlist":
		if !strings.Contains(postProcessorChainResult, "com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector") {
			postProcessorChainResult += ",com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector"
		}
	case "blocklist":
		if !strings.Contains(postProcessorChainResult, "com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector") {
			postProcessorChainResult += ",com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector"
		}
	}

	switch valueProjectionType {
	case "allowlist":
		if !strings.Contains(postProcessorChainResult, "com.mongodb.kafka.connect.sink.processor.AllowListValueProjector") {
			postProcessorChainResult += ",com.mongodb.kafka.connect.sink.processor.AllowListValueProjector"
		}
	case "blocklist":
		if !strings.Contains(postProcessorChainResult, "com.mongodb.kafka.connect.sink.processor.BlockListValueProjector") {
			postProcessorChainResult += ",com.mongodb.kafka.connect.sink.processor.BlockListValueProjector"
		}
	}

	if fieldRenamerMapping != nil && fieldRenamerMapping != "" && fieldRenamerMapping != "[]" {
		if !strings.Contains(postProcessorChainResult, "com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping") {
			postProcessorChainResult += ",com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping"
		}
	}

	return postProcessorChainResult
}

// KafkaConnectValidateToConsoleMongoDBHook adds connection fields: URL, username and password
func KafkaConnectValidateToConsoleMongoDBHook(response model.ValidationResponse, _ map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs,
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "connection.url",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    "HIGH",
				Required:      true,
				DisplayName:   "MongoDB Connection URL",
				Documentation: "The connection URL as supported by the official drivers. eg: mongodb://locahost/",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "connection.url",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:         "connection.username",
				Type:         "STRING",
				DefaultValue: "",
				Importance:   "HIGH",
				Required:     false,
				DisplayName:  "MongoDB username",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "connection.username",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:         "connection.password",
				Type:         "PASSWORD",
				DefaultValue: "",
				Importance:   "HIGH",
				Required:     false,
				DisplayName:  "MongoDB password",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "connection.password",
				Value:             "",
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
		},
	)

	return response
}
