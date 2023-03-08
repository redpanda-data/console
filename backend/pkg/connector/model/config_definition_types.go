// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package model

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
