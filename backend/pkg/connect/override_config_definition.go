// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"encoding/json"

	con "github.com/cloudhut/connect-client"
)

// ConfigDefinition is used for specifying the set of expected connect plugin configurations.
// For each configuration, you can specify all the properties that are available in the upstream
// connect framework such as the config name, the type, the default value, the field width,
// the importance etc.
//
// This information is used by Console to render a setup wizard in the UI.
//
// Some properties are not reported by connector plugins, even though they are configurable
// for e.g. the MirrorMaker2 plugin. Therefore, we create and inject these properties.
type ConfigDefinition struct {
	Name         string               `json:"name"`
	Type         ConfigDefinitionType `json:"type"`
	DefaultValue string               `json:"default_value"`
	// CustomDefaultValue is a default value that we override. We use a separate variable
	// for it so that the frontend knows it has to override the actual connector default value.
	CustomDefaultValue string                                                 `json:"custom_default_value,omitempty"`
	Importance         ConfigDefinitionImportance                             `json:"importance"`
	Documentation      string                                                 `json:"documentation"`
	Group              *string                                                `json:"group"`
	OrderInGroup       int                                                    `json:"order_in_group"`
	Width              ConfigDefinitionWidth                                  `json:"width"`
	Required           bool                                                   `json:"required"`
	DisplayName        string                                                 `json:"display_name"`
	Dependents         []string                                               `json:"dependents"`
	RecommendedValues  []string                                               `json:"-"`
	ValidatorFunc      func(cd *ConfigDefinition, value interface{}) []string `json:"-"`
}

// ConfigDefinitionOption implements the functional options pattern for ConfigDefinition.
type ConfigDefinitionOption = func(c *ConfigDefinition)

// WithValidatorFunc adds a function that is able to validate the value for the given
// config.
func WithValidatorFunc(fn func(cd *ConfigDefinition, value interface{}) []string) ConfigDefinitionOption {
	return func(c *ConfigDefinition) {
		c.ValidatorFunc = fn
	}
}

// WithWidth allows to set the field width of the config option.
func WithWidth(width ConfigDefinitionWidth) ConfigDefinitionOption {
	return func(c *ConfigDefinition) {
		c.Width = width
	}
}

// WithCustomDefaultValue sets the default value to a different value.
func WithCustomDefaultValue(customDefaultValue string) ConfigDefinitionOption {
	return func(c *ConfigDefinition) {
		c.CustomDefaultValue = customDefaultValue
	}
}

// WithRecommendedValues allows to provide a list of accepted values for a configuration.
// These values will be presented as a dropdown / enum.
func WithRecommendedValues(recommendedValues []string) ConfigDefinitionOption {
	return func(c *ConfigDefinition) {
		c.RecommendedValues = recommendedValues
	}
}

// ConfigDefinitionImportance is the importance level for a configuration.
type ConfigDefinitionImportance = string

const (
	// ConfigDefinitionImportanceHigh mark configurations that will always be shown in the form.
	ConfigDefinitionImportanceHigh ConfigDefinitionImportance = "HIGH"

	// ConfigDefinitionImportanceMedium mark configurations that will always be shown in the form.
	ConfigDefinitionImportanceMedium ConfigDefinitionImportance = "MEDIUM"

	// ConfigDefinitionImportanceLow mark configurations that will only be shown in the advanced section.
	ConfigDefinitionImportanceLow ConfigDefinitionImportance = "LOW"
)

// ConfigDefinitionWidth describes the width of a configuration value. It's used to determine
// the width of input fields in the setup form.
type ConfigDefinitionWidth = string

const (
	// ConfigDefinitionWidthNone declares an unknown width for the config field.
	ConfigDefinitionWidthNone ConfigDefinitionWidth = "NONE"
	// ConfigDefinitionWidthShort declares a sgirt width for the config field.
	ConfigDefinitionWidthShort ConfigDefinitionWidth = "SHORT"
	// ConfigDefinitionWidthMedium declares a medium width for the config field.
	ConfigDefinitionWidthMedium ConfigDefinitionWidth = "MEDIUM"
	// ConfigDefinitionWidthLong declares a long width for the config field.
	ConfigDefinitionWidthLong ConfigDefinitionWidth = "LONG"
)

// ConfigDefinitionType declares the configuration type.
type ConfigDefinitionType = string

const (
	// ConfigDefinitionTypeBoolean declares a boolean.
	ConfigDefinitionTypeBoolean ConfigDefinitionType = "BOOLEAN"
	// ConfigDefinitionTypeString declares a string.
	ConfigDefinitionTypeString ConfigDefinitionType = "STRING"
	// ConfigDefinitionTypeInt declares an integer.
	ConfigDefinitionTypeInt ConfigDefinitionType = "INT"
	// ConfigDefinitionTypeShort declares a short.
	ConfigDefinitionTypeShort ConfigDefinitionType = "SHORT"
	// ConfigDefinitionTypeLong declares a long.
	ConfigDefinitionTypeLong ConfigDefinitionType = "LONG"
	// ConfigDefinitionTypeDouble declares a double.
	ConfigDefinitionTypeDouble ConfigDefinitionType = "DOUBLE"
	// ConfigDefinitionTypeList declares a list.
	ConfigDefinitionTypeList ConfigDefinitionType = "LIST"
	// ConfigDefinitionTypeClass declares a class.
	ConfigDefinitionTypeClass ConfigDefinitionType = "CLASS"
	// ConfigDefinitionTypePassword declares a password.
	ConfigDefinitionTypePassword ConfigDefinitionType = "PASSWORD"
)

// ToKafkaConnectCompatible marshals the struct so that it is compatible with the usual
// Kafka connect output. It accepts the given value as sent by the frontend in order to
// validate it and return potential validation errors.
func (c *ConfigDefinition) ToKafkaConnectCompatible(value interface{}) con.ConnectorValidationResultConfig {
	type Value struct {
		Name              string      `json:"name"`
		Value             interface{} `json:"value"`
		RecommendedValues []string    `json:"recommended_values"`
		Errors            []string    `json:"errors"`
		Visible           bool        `json:"visible"`
	}

	var configDefMap map[string]interface{}
	d, _ := json.Marshal(c)
	json.Unmarshal(d, &configDefMap)

	if value == nil {
		if c.DefaultValue != "" {
			value = c.DefaultValue
		}
		if c.CustomDefaultValue != "" {
			value = c.CustomDefaultValue
		}
	}
	res := con.ConnectorValidationResultConfig{
		Definition: configDefMap,
		Value: map[string]interface{}{
			"name":               c.Name,
			"value":              value,
			"recommended_values": c.RecommendedValues,
			"errors":             c.ValidatorFunc(c, value),
			"visible":            true,
		},
	}

	return res
}

// NewConfigDefinition creates a new config definition for a connector plugin.
func NewConfigDefinition(name string,
	confType ConfigDefinitionType,
	defaultValue string,
	importance ConfigDefinitionImportance,
	documentation string,
	group *string,
	orderInGroup int,
	required bool,
	displayName string,
	options ...func(definition *ConfigDefinition),
) ConfigDefinition {
	configDef := ConfigDefinition{
		Name:              name,
		Type:              confType,
		DefaultValue:      defaultValue,
		Importance:        importance,
		Documentation:     documentation,
		Group:             group,
		OrderInGroup:      orderInGroup,
		Width:             ConfigDefinitionWidthMedium,
		Required:          required,
		DisplayName:       displayName,
		Dependents:        []string{},
		RecommendedValues: []string{},
		ValidatorFunc:     defaultValidator,
	}

	for _, opt := range options {
		opt(&configDef)
	}

	return configDef
}

func newClientConfig(prefix string, group string) []ConfigDefinition {
	// Bootstrap Servers
	bootstrapServers := NewConfigDefinition(
		prefix+"cluster.bootstrap.servers",
		ConfigDefinitionTypeString,
		"",
		ConfigDefinitionImportanceHigh,
		"A list of host/port pairs to use for establishing the initial connection to the Kafka cluster. The client will make use of all servers irrespective of which servers are specified here for bootstrapping&mdash;this list only impacts the initial hosts used to discover the full set of servers. This list should be in the form "+
			"host1:port1,host2:port2,.... Since these servers are just used for the initial connection to "+
			"discover the full cluster membership (which may change dynamically), this list need not contain the full set of "+
			"servers (you may want more than one, though, in case a server is down).",
		&group,
		0,
		true,
		"Bootstrap servers",
		WithValidatorFunc(hostnamesValidator),
	)

	// Security
	securityProtocol := NewConfigDefinition(
		prefix+"cluster.security.protocol",
		ConfigDefinitionTypeString,
		"PLAINTEXT",
		ConfigDefinitionImportanceHigh,
		"Protocol used to communicate with brokers. Valid values are: PLAINTEXT, SSL, SASL_PLAINTEXT, SASL_SSL.",
		&group,
		1,
		true,
		"Security protocol",
		WithCustomDefaultValue("SASL_SSL"),
		WithRecommendedValues([]string{"PLAINTEXT", "SSL", "SASL_PLAINTEXT", "SASL_SSL"}),
	)

	// SASL
	saslMechanism := NewConfigDefinition(
		prefix+"cluster.sasl.mechanism",
		ConfigDefinitionTypeString,
		"GSSAPI",
		ConfigDefinitionImportanceHigh,
		"SASL mechanism used for client connections. This may be any mechanism for which a security provider is available. GSSAPI is the default mechanism.",
		&group,
		2,
		false,
		"SASL Mechanism",
		WithCustomDefaultValue("PLAIN"),
		WithRecommendedValues([]string{"PLAIN", "SCRAM-SHA-256", "SCRAM-SHA-512"}),
	)
	jaasConfig := NewConfigDefinition(
		prefix+"cluster.sasl.jaas.config",
		ConfigDefinitionTypeString,
		"",
		ConfigDefinitionImportanceHigh,
		"JAAS login context parameters for SASL connections in the format used by JAAS configuration files. "+
			"JAAS configuration file format is described at http://docs.oracle.com/javase/8/docs/technotes/guides/security/jgss/tutorials/LoginConfigFile.html. "+
			"The format for the value is: loginModuleClass controlFlag (optionName=optionValue)*;. For brokers, "+
			"the config must be prefixed with listener prefix and SASL mechanism name in lower-case. For example, "+
			"listener.name.sasl_ssl.scram-sha-256.sasl.jaas.config=com.example.ScramLoginModule required;",
		&group,
		3,
		false,
		"SASL JAAS config",
		WithCustomDefaultValue("org.apache.kafka.common.security.plain.PlainLoginModule required username='...' password='...';"),
	)

	return []ConfigDefinition{
		bootstrapServers,
		securityProtocol,
		saslMechanism,
		jaasConfig,
	}
}
