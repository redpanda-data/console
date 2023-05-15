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
	setFormatOutputStream(config)
	setPostProcessorChain(config)

	return config
}

func setConnectionURI(config map[string]any) {
	if _, exists := config["connection.uri"]; !exists {
		if _, exists := config["connection.url"]; exists {
			config["connection.uri"] = config["connection.url"]
		} else {
			config["connection.uri"] = "mongodb://"
		}
	}

	if _, exists := config["connection.url"]; !exists {
		config["connection.url"] = config["connection.uri"]
	}

	if config["connection.username"] != nil && config["connection.password"] != nil && config["connection.url"] != nil {
		password := config["connection.password"].(string)
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

func setFormatOutputStream(config map[string]any) {
	for _, field := range []string{"key", "value"} {
		if config["output.format."+field] == nil {
			switch config[field+".converter"] {
			case "org.apache.kafka.connect.json.JsonConverter",
				"io.confluent.connect.avro.AvroConverter":
				config["output.format."+field] = "schema"
			case "org.apache.kafka.connect.storage.StringConverter":
				config["output.format."+field] = "json"
			case "org.apache.kafka.connect.converters.ByteArrayConverter":
				config["output.format."+field] = "bson"
			}
		}
	}
}

func setPostProcessorChain(config map[string]any) {
	var postProcessorChain string
	if config["post.processor.chain"] != nil {
		postProcessorChain = config["post.processor.chain"].(string)
	} else {
		postProcessorChain = "com.mongodb.kafka.connect.sink.processor.DocumentIdAdder"
	}

	switch config["key.projection.type"] {
	case "allowlist":
		if !strings.Contains(postProcessorChain, "com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector") {
			postProcessorChain += ",com.mongodb.kafka.connect.sink.processor.AllowListKeyProjector"
		}
	case "blocklist":
		if !strings.Contains(postProcessorChain, "com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector") {
			postProcessorChain += ",com.mongodb.kafka.connect.sink.processor.BlockListKeyProjector"
		}
	}

	switch config["value.projection.type"] {
	case "allowlist":
		if !strings.Contains(postProcessorChain, "com.mongodb.kafka.connect.sink.processor.AllowListValueProjector") {
			postProcessorChain += ",com.mongodb.kafka.connect.sink.processor.AllowListValueProjector"
		}
	case "blocklist":
		if !strings.Contains(postProcessorChain, "com.mongodb.kafka.connect.sink.processor.BlockListValueProjector") {
			postProcessorChain += ",com.mongodb.kafka.connect.sink.processor.BlockListValueProjector"
		}
	}

	if config["field.renamer.mapping"] != nil && config["field.renamer.mapping"] != "[]" {
		if !strings.Contains(postProcessorChain, "com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping") {
			postProcessorChain += ",com.mongodb.kafka.connect.sink.processor.field.renaming.RenameByMapping"
		}
	}

	config["post.processor.chain"] = postProcessorChain
}

// KafkaConnectToConsoleMongoDBHook adds connection fields: URL, username and password
func KafkaConnectToConsoleMongoDBHook(response model.ValidationResponse, _ map[string]any) model.ValidationResponse {
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
	)

	return response
}
