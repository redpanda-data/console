import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	Cpu,
	Database,
	FolderInput,
	FolderOutput,
	HelpCircle,
	Layers,
	Search,
	SearchIcon,
	Timer,
	XCircle,
} from "lucide-react";
import type { ConnectConfig } from "state/onboarding-wizard/state";
import { stringify as yamlStringify } from "yaml";
import benthosSchema from "../../../../assets/rp-connect-schema.json";
import type { DataType } from "../types";
import type { ComponentSpec, FieldSpec } from "../types/connect";
import { COMPONENT_TYPE } from "../types/connect";
import type {
	AddDataFormData,
	AddTopicFormData,
	AddUserFormData,
} from "../types/forms";

export type ConnectionType = {
	name: string;
	/** Logo or icon */
	src?: string;
	/** URL to documentation */
	docUrl?: string;
	/** URL to secondary documentation */
	docUrl2?: string;
	/** format of documentation */
	docFormat?: "markdown" | "asciidoc";
};

/**
 * Extracts the component specification for a specific connection type
 */
export const extractConnectionSchema = (
	connectionName: string,
	type: "input" | "output",
): ComponentSpec | null => {
	const components = type === "input" ? getInputs() : getOutputs();
	return (
		components.find((component) => component.name === connectionName) || null
	);
};

/**
 * Converts a component specification to a config structure with default values
 */
export const schemaToConfig = (
	componentSpec: ComponentSpec,
	connectionName: string,
	type: "input" | "output",
) => {
	if (!componentSpec?.config) {
		return null;
	}

	// Generate the configuration object from the component's FieldSpec
	const connectionConfig = generateDefaultValue(componentSpec.config) as Record<
		string,
		unknown
	>;

	return {
		[type]: {
			[connectionName]: connectionConfig,
		},
	};
};

type ConnectionConfig = Record<string, unknown>;
type BaseConfig = {
	input?: Record<string, ConnectionConfig>;
	output?: Record<string, ConnectionConfig>;
};

/**
 * Populates a base config with data from wizard form steps
 */
export const populateConfigWithFormData = (
	baseConfig: BaseConfig,
	formData: Partial<AddDataFormData & AddTopicFormData & AddUserFormData>,
	connectionName: string,
	type: "input" | "output",
): BaseConfig => {
	const populatedConfig = structuredClone(baseConfig);
	const connectionConfig = populatedConfig[type]?.[connectionName];

	if (!connectionConfig) {
		return baseConfig;
	}

	// Populate topic-related data
	if (formData.topicName) {
		if (connectionName === "kafka" || connectionName === "kafka_franz") {
			if ("topics" in connectionConfig) {
				connectionConfig.topics = [formData.topicName];
			}
		}
		if ("topic" in connectionConfig) {
			connectionConfig.topic = formData.topicName;
		}
	}

	// Populate SASL authentication data
	if (
		"sasl" in connectionConfig &&
		typeof connectionConfig.sasl === "object" &&
		connectionConfig.sasl
	) {
		const saslConfig = connectionConfig.sasl as Record<string, unknown>;

		if (formData.saslMechanism) {
			saslConfig.mechanism = formData.saslMechanism;
		}
		if (formData.username) {
			saslConfig.user = formData.username;
		}
		if (formData.password) {
			saslConfig.password = formData.password;
		}
	}

	// Populate other connection-specific configurations
	if (formData.partitions && "partitions" in connectionConfig) {
		connectionConfig.partitions = formData.partitions;
	}

	if (formData.replicationFactor && "replication_factor" in connectionConfig) {
		connectionConfig.replication_factor = formData.replicationFactor;
	}

	// Populate addresses for Kafka connections if not already set
	if (
		(connectionName === "kafka" || connectionName === "kafka_franz") &&
		"addresses" in connectionConfig
	) {
		const currentAddresses = connectionConfig.addresses as string[];
		if (!currentAddresses || currentAddresses.length === 0) {
			// Set a placeholder that indicates this is required
			connectionConfig.addresses = ["localhost:9092"]; // Reasonable default for development
		}
	}

	// Set reasonable defaults for common Kafka settings if not already populated
	if (connectionName === "kafka") {
		// Set client_id default if empty
		if ("client_id" in connectionConfig && !connectionConfig.client_id) {
			connectionConfig.client_id = "benthos";
		}

		// Set default commit period if empty
		if (
			"commit_period" in connectionConfig &&
			!connectionConfig.commit_period
		) {
			connectionConfig.commit_period = "1s";
		}

		// Set default checkpoint limit if zero
		if (
			"checkpoint_limit" in connectionConfig &&
			connectionConfig.checkpoint_limit === 0
		) {
			connectionConfig.checkpoint_limit = 1024;
		}

		// Set default max processing period if empty
		if (
			"max_processing_period" in connectionConfig &&
			!connectionConfig.max_processing_period
		) {
			connectionConfig.max_processing_period = "100ms";
		}

		// Set default fetch buffer capacity if zero
		if (
			"fetch_buffer_cap" in connectionConfig &&
			connectionConfig.fetch_buffer_cap === 0
		) {
			connectionConfig.fetch_buffer_cap = 256;
		}

		// Set reasonable group defaults
		if (
			"group" in connectionConfig &&
			typeof connectionConfig.group === "object" &&
			connectionConfig.group
		) {
			const groupConfig = connectionConfig.group as Record<string, unknown>;
			if (!groupConfig.session_timeout) groupConfig.session_timeout = "10s";
			if (!groupConfig.heartbeat_interval)
				groupConfig.heartbeat_interval = "3s";
			if (!groupConfig.rebalance_timeout) groupConfig.rebalance_timeout = "60s";
		}

		// Set start_from_oldest default
		if (
			"start_from_oldest" in connectionConfig &&
			connectionConfig.start_from_oldest === false
		) {
			connectionConfig.start_from_oldest = true;
		}

		// Set auto_replay_nacks default
		if (
			"auto_replay_nacks" in connectionConfig &&
			connectionConfig.auto_replay_nacks === false
		) {
			connectionConfig.auto_replay_nacks = true;
		}
	}

	return populatedConfig;
};

/**
 * Adds inline comments to YAML string based on component specification
 */
const addSchemaComments = (
	yamlString: string,
	componentSpec: ComponentSpec,
): string => {
	if (!componentSpec.config.children) {
		return yamlString;
	}

	// Create a map of field paths to their specs for quick lookup
	const fieldMap = new Map<string, FieldSpec>();
	const addFieldsToMap = (fields: FieldSpec[], prefix = "") => {
		fields.forEach((field) => {
			const fullName = prefix ? `${prefix}.${field.name}` : field.name;
			fieldMap.set(fullName, field);
			fieldMap.set(field.name, field); // Also add without prefix for direct lookup

			if (field.children) {
				addFieldsToMap(field.children, fullName);
			}
		});
	};

	addFieldsToMap(componentSpec.config.children);

	// Parse YAML lines and track nesting context
	const lines = yamlString.split("\n");
	const contextStack: string[] = []; // Track current nesting path
	const indentStack: number[] = []; // Track indentation levels

	const processedLines = lines.map((line) => {
		// Skip empty lines and comments
		if (!line.trim() || line.trim().startsWith("#")) {
			return line;
		}

		// Calculate current indentation
		const currentIndent = line.length - line.trimStart().length;

		// Extract key and value
		const keyValueMatch = line.match(/^(\s*)([^:#\n]+):\s*(.*)$/);
		if (!keyValueMatch) {
			return line;
		}

		const [, indent, key, value] = keyValueMatch;
		const cleanKey = key.trim();
		const hasExistingComment = line.includes("#");

		if (hasExistingComment) {
			return line; // Don't override existing comments
		}

		// Update context stack based on indentation
		while (
			indentStack.length > 0 &&
			currentIndent <= indentStack[indentStack.length - 1]
		) {
			indentStack.pop();
			contextStack.pop();
		}

		// Build full path for this key
		const fullPath =
			contextStack.length > 0
				? `${contextStack.join(".")}.${cleanKey}`
				: cleanKey;

		// Look up field spec using full path or just key name
		let fieldSpec = fieldMap.get(fullPath) || fieldMap.get(cleanKey);

		// If not found, try parent context + key (for cases where schema structure differs)
		if (!fieldSpec && contextStack.length > 0) {
			for (let i = contextStack.length - 1; i >= 0; i--) {
				const partialPath = `${contextStack.slice(i).join(".")}.${cleanKey}`;
				fieldSpec = fieldMap.get(partialPath);
				if (fieldSpec) break;
			}
		}

		// Determine if this key will have children (object/array values)
		const hasChildren =
			value.trim() === "" || value.trim() === "{}" || value.trim() === "[]";

		if (hasChildren) {
			// Add to context stack for nested fields
			contextStack.push(cleanKey);
			indentStack.push(currentIndent);
		}

		if (!fieldSpec) {
			return line;
		}

		// Format the comment based on field properties
		let comment = "";

		if (!fieldSpec.is_optional) {
			// Required field
			if (fieldSpec.default !== undefined) {
				comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
			} else {
				comment = " # Required";
			}
		} else {
			// Optional field
			if (fieldSpec.default !== undefined) {
				comment = ` # Default: ${JSON.stringify(fieldSpec.default)}`;
			} else {
				comment = " # Optional";
			}
		}

		// Don't add comments to structural elements (empty objects/arrays)
		if (
			(value.trim() === "{}" || value.trim() === "[]") &&
			!fieldSpec.default
		) {
			comment = "";
		}

		return `${indent}${cleanKey}: ${value}${comment}`;
	});

	return processedLines.join("\n");
};

const yamlOptions = {
	indent: 2,
	lineWidth: 120,
	minContentWidth: 20,
	doubleQuotedAsJSON: false,
};

/**
 * Converts a config object to formatted YAML with comments
 */
export const configToYaml = (
	config: BaseConfig,
	componentSpec: ComponentSpec,
): string => {
	try {
		let yamlString = yamlStringify(config, yamlOptions);

		// Add schema-based comments for optional fields
		yamlString = addSchemaComments(yamlString, componentSpec);

		return yamlString;
	} catch (error) {
		console.error("Error converting config to YAML:", error);
		return JSON.stringify(config, null, 2);
	}
};

export const generateConnectConfig = (
	formData: Partial<AddDataFormData & AddTopicFormData & AddUserFormData>,
	connectConfig?: ConnectConfig,
) => {
	const { connection } = formData;

	if (!connectConfig?.type || !connection) {
		return { yaml: connectConfig?.yaml || "" };
	}

	const { type } = connectConfig;

	if (!connection || (type !== "input" && type !== "output")) {
		return { yaml: "" };
	}

	try {
		// Extract component specification for the specific connection
		const componentSpec = extractConnectionSchema(connection, type);
		if (!componentSpec) {
			return { yaml: "" };
		}

		// Generate base config from component specification
		const baseConfig = schemaToConfig(componentSpec, connection, type);
		if (!baseConfig) {
			return { yaml: "" };
		}

		// Populate config with form data
		const populatedConfig = populateConfigWithFormData(
			baseConfig,
			formData,
			connection,
			type,
		);

		// Convert to formatted YAML with schema comments
		const generatedYaml = configToYaml(populatedConfig, componentSpec);

		return {
			yaml: generatedYaml,
		};
	} catch (error) {
		console.error("Error generating connect config:", error);
		return { yaml: "" };
	}
};

export function generateDefaultValue(spec: FieldSpec): unknown {
	// Use the explicit default if it exists
	if (spec.default !== undefined) {
		return spec.default;
	}

	switch (spec.kind) {
		case "scalar":
			switch (spec.type) {
				case "string":
					return "";
				case "int":
				case "float":
					return 0;
				case "bool":
					return false;
				case "object": // A scalar object is a complex type, render its children
					if (spec.children) {
						const obj = {} as Record<string, unknown>;

						// For configuration templates, include all fields to provide comprehensive examples
						// This gives users visibility into all available configuration options
						for (const child of spec.children) {
							obj[child.name] = generateDefaultValue(child);
						}

						return obj;
					}
					return {};
				default:
					return ""; // Fallback for other types like 'input', 'processor' etc.
			}
		case "array":
			return [];
		case "2darray":
			return [];
		case "map":
			return {};
		default:
			return undefined;
	}
}

/** Build an empty object with defaults for every child field. */
export function buildObjectItem(
	children: FieldSpec[],
): Record<string, unknown> {
	return children.reduce(
		(acc, child) => {
			acc[child.name] = generateDefaultValue(child);
			return acc;
		},
		{} as Record<string, unknown>,
	);
}

/** Wrap primitives so RHF can inject its `id` property safely. */
export function wrapIfPrimitive(val: unknown) {
	return typeof val === "object" && val !== null ? val : { value: val };
}

/** True when the child spec represents a single primitive value. */
export function isPrimitiveScalar(spec: FieldSpec) {
	return (
		spec.kind === "scalar" &&
		spec.type !== "object" && // object scalars are complex
		!isComponentType(spec.type)
	);
}

/** Does the `type` string correspond to a Benthos component type? */
export function isComponentType(t: string | undefined): boolean {
	return (COMPONENT_TYPE as readonly string[]).includes(t as string);
}

export interface NodeCategory {
	id: string;
	name: string;
	components: ComponentSpec[];
}

export interface SchemaNodeConfig {
	id: string;
	name: string;
	type: string;
	category:
		| "input"
		| "output"
		| "processor"
		| "cache"
		| "buffer"
		| "rate_limit"
		| "scanner";
	status: string;
	summary?: string;
	description?: string;
	config: ComponentSpec["config"];
	categories?: string[] | null;
	version?: string;
}

// JSON Schema interfaces for parsing the actual schema file
interface JsonSchemaProperty {
	type?: string;
	properties?: Record<string, JsonSchemaProperty>;
	items?: JsonSchemaProperty;
	required?: string[];
	additionalProperties?: boolean | JsonSchemaProperty;
	anyOf?: JsonSchemaProperty[];
	allOf?: JsonSchemaProperty[];
	$ref?: string;
}

interface JsonSchema {
	definitions?: Record<string, JsonSchemaProperty>;
	properties?: Record<string, JsonSchemaProperty>;
}

// Utility functions for generating summaries and display names
const generateSummary = (componentName: string, type: string): string => {
	const formattedName = componentName
		.replace(/_/g, " ")
		.replace(/\b\w/g, (l) => l.toUpperCase());
	const formattedType = type.charAt(0).toUpperCase() + type.slice(1);
	return `${formattedName} ${formattedType.toLowerCase()}`;
};

const getCategoryDisplayName = (category: string): string => {
	const displayNames: Record<string, string> = {
		input: "Inputs",
		output: "Outputs",
		processor: "Processors",
		cache: "Caches",
		buffer: "Buffers",
		rate_limit: "Rate Limits",
		scanner: "Scanners",
	};
	return displayNames[category] || category;
};

// Convert JSON Schema to FieldSpec with proper type handling
const convertJsonSchemaToFieldSpec = (
	jsonSchema: JsonSchemaProperty,
	name: string,
	parentRequired?: string[],
): FieldSpec => {
	const fieldSpec: FieldSpec = {
		name,
		type: "string", // Default fallback
		kind: "scalar",
		is_optional: !parentRequired?.includes(name),
	};

	// Handle different schema types
	if (jsonSchema.type) {
		switch (jsonSchema.type) {
			case "boolean":
				fieldSpec.type = "bool";
				// Don't set default for booleans - let generateDefaultValue handle it
				break;
			case "integer":
			case "number":
				fieldSpec.type = jsonSchema.type === "integer" ? "int" : "float";
				// Don't set default for numbers - let generateDefaultValue handle it
				break;
			case "string":
				fieldSpec.type = "string";
				// Don't set default for strings - let generateDefaultValue handle it
				break;
			case "array":
				fieldSpec.kind = "array";
				fieldSpec.type = "array";
				// Don't set default for arrays - let generateDefaultValue handle it
				// Handle array items if specified
				if (jsonSchema.items) {
					fieldSpec.children = [
						convertJsonSchemaToFieldSpec(jsonSchema.items, "item", []),
					];
				}
				break;
			case "object":
				fieldSpec.type = "object";
				fieldSpec.kind = "scalar";

				// Convert properties to children
				if (jsonSchema.properties) {
					fieldSpec.children = Object.entries(jsonSchema.properties).map(
						([childName, childSchema]) =>
							convertJsonSchemaToFieldSpec(
								childSchema,
								childName,
								jsonSchema.required,
							),
					);
				}
				// Don't set default for objects - let generateDefaultValue handle it
				break;
		}
	} else if (jsonSchema.properties) {
		// No explicit type but has properties - treat as object
		fieldSpec.type = "object";
		fieldSpec.kind = "scalar";
		fieldSpec.children = Object.entries(jsonSchema.properties).map(
			([childName, childSchema]) =>
				convertJsonSchemaToFieldSpec(
					childSchema,
					childName,
					jsonSchema.required,
				),
		);
	} else if (jsonSchema.anyOf || jsonSchema.allOf) {
		// Handle schema compositions - for now, just treat as generic object
		fieldSpec.type = "object";
		fieldSpec.kind = "scalar";
	}

	return fieldSpec;
};

// Extract components from JSON Schema definition
const extractComponentsFromDefinition = (
	definition: JsonSchemaProperty,
	type: string,
): ComponentSpec[] => {
	const components: ComponentSpec[] = [];

	// Navigate the allOf > anyOf structure to find component properties
	if (definition.allOf && definition.allOf.length > 0) {
		const firstAllOf = definition.allOf[0];
		if (firstAllOf.anyOf) {
			for (const anyOfItem of firstAllOf.anyOf) {
				if (anyOfItem.properties) {
					// Each properties object should have one key (the component name)
					for (const [componentName, componentSchema] of Object.entries(
						anyOfItem.properties,
					)) {
						if (
							componentSchema.properties ||
							componentSchema.type === "object"
						) {
							const componentSpec: ComponentSpec = {
								name: componentName,
								type,
								status: "stable", // Default status, could be extracted from schema if available
								summary: generateSummary(componentName, type),
								config: convertJsonSchemaToFieldSpec(
									componentSchema,
									componentName,
									componentSchema.required,
								),
								plugin: false, // Default to false for built-in components
								categories: null, // No category information available in JSON Schema
							};
							components.push(componentSpec);
						}
					}
				}
			}
		}
	}

	return components;
};

// Parse the schema and cache results
const jsonSchema = benthosSchema as JsonSchema;

const parseSchema = () => {
	if (!jsonSchema.definitions) {
		console.warn("No definitions found in schema");
		return {
			componentsByType: new Map(),
			nodeConfigs: new Map(),
			categories: new Map(),
		};
	}

	const componentsByType = new Map<string, ComponentSpec[]>();
	const nodeConfigs = new Map<string, SchemaNodeConfig>();
	const categories = new Map<string, NodeCategory>();

	// Parse each component type from the schema definitions
	const componentTypes = [
		{ key: "input", category: "input" as const },
		{ key: "output", category: "output" as const },
		{ key: "processor", category: "processor" as const },
		{ key: "cache", category: "cache" as const },
		{ key: "buffer", category: "buffer" as const },
		{ key: "rate_limit", category: "rate_limit" as const },
		{ key: "scanner", category: "scanner" as const },
	];

	for (const { key, category } of componentTypes) {
		const definition = jsonSchema.definitions[key];
		if (definition) {
			const components = extractComponentsFromDefinition(definition, key);
			componentsByType.set(key, components);

			const categoryData: NodeCategory = {
				id: category,
				name: getCategoryDisplayName(category),
				components,
			};
			categories.set(category, categoryData);

			// Create node configs for each component
			for (const component of components) {
				const nodeConfig: SchemaNodeConfig = {
					id: `${category}-${component.name}`,
					name: component.name,
					type: component.type,
					category,
					status: component.status || "stable",
					summary: component.summary,
					description: component.description,
					config: component.config,
					categories: component.categories,
					version: component.version,
				};
				nodeConfigs.set(nodeConfig.id, nodeConfig);
			}
		}
	}

	return { componentsByType, nodeConfigs, categories };
};

// Cache the parsed schema data
const { componentsByType, nodeConfigs, categories } = parseSchema();

// Exported utility functions
export const getCategories = (): NodeCategory[] =>
	Array.from(categories.values());

export const getAllNodeConfigs = (): SchemaNodeConfig[] =>
	Array.from(nodeConfigs.values());

export const getNodeConfigsByCategory = (
	category: string,
): SchemaNodeConfig[] =>
	getAllNodeConfigs().filter((config) => config.category === category);

export const getNodeConfig = (id: string): SchemaNodeConfig | undefined =>
	nodeConfigs.get(id);

export const searchNodeConfigs = (query: string): SchemaNodeConfig[] => {
	const lowerQuery = query.toLowerCase();
	return getAllNodeConfigs().filter(
		(config) =>
			config.name.toLowerCase().includes(lowerQuery) ||
			config.summary?.toLowerCase().includes(lowerQuery) ||
			config.description?.toLowerCase().includes(lowerQuery),
	);
};

export const getNodeConfigsByStatus = (status: string): SchemaNodeConfig[] =>
	getAllNodeConfigs().filter((config) => config.status === status);

export const getSchemaVersion = (): string => "unknown"; // JSON Schema format doesn't include version

// Component type getters (for backward compatibility)
export const getInputs = (): ComponentSpec[] =>
	componentsByType.get("input") || [];

export const getOutputs = (): ComponentSpec[] =>
	componentsByType.get("output") || [];

export const getProcessors = (): ComponentSpec[] =>
	componentsByType.get("processor") || [];

export const getCaches = (): ComponentSpec[] =>
	componentsByType.get("cache") || [];

export const getBuffers = (): ComponentSpec[] =>
	componentsByType.get("buffer") || [];

export const getRateLimits = (): ComponentSpec[] =>
	componentsByType.get("rate_limit") || [];

export const getScanners = (): ComponentSpec[] =>
	componentsByType.get("scanner") || [];

export const getAllComponents = (): ComponentSpec[] => [
	...getInputs(),
	...getOutputs(),
	...getProcessors(),
	...getCaches(),
	...getBuffers(),
	...getRateLimits(),
	...getScanners(),
];

export const getCategoryConfig = (category: string[] | null) => {
	if (!category) return;
	return category.map((c) => {
		switch (c) {
			case "input":
				return {
					icon: <FolderInput className="h-3 w-3" />,
					text: "Input",
					className:
						"bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
				};
			case "output":
				return {
					icon: <FolderOutput className="h-3 w-3" />,
					text: "Output",
					className:
						"bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
				};
			case "processor":
				return {
					icon: <Cpu className="h-3 w-3" />,
					text: "Processor",
					className:
						"bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
				};
			case "cache":
				return {
					icon: <Database className="h-3 w-3" />,
					text: "Cache",
					className:
						"bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
				};
			case "buffer":
				return {
					icon: <Layers className="h-3 w-3" />,
					text: "Buffer",
					className:
						"bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
				};
			case "rate_limit":
				return {
					icon: <Timer className="h-3 w-3" />,
					text: "Rate Limit",
					className:
						"bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
				};
			case "scanner":
				return {
					icon: <Search className="h-3 w-3" />,
					text: "Scanner",
					className:
						"bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300",
				};
			default:
				return {
					icon: <HelpCircle className="h-3 w-3" />,
					text: c.charAt(0).toUpperCase() + c.slice(1),
					className:
						"bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
				};
		}
	});
};

export const getStatusConfig = (status: string) => {
	switch (status) {
		case "stable":
			return {
				icon: <CheckCircle2 className="h-3 w-3" />,
				text: "Stable",
				className:
					"bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
			};
		case "beta":
			return {
				icon: <Clock className="h-3 w-3" />,
				text: "Beta",
				className:
					"bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
			};
		case "experimental":
			return {
				icon: <AlertTriangle className="h-3 w-3" />,
				text: "Experimental",
				className:
					"bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
			};
		case "deprecated":
			return {
				icon: <XCircle className="h-3 w-3" />,
				text: "Deprecated",
				className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
			};
		default:
			return {
				icon: <HelpCircle className="h-3 w-3" />,
				text: status.charAt(0).toUpperCase() + status.slice(1),
				className:
					"bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
			};
	}
};

export const inferComponentCategory = (componentName: string): string[] => {
	const name = componentName.toLowerCase();
	const categories: string[] = [];

	// Database-related components
	if (
		name.includes("sql") ||
		name.includes("postgres") ||
		name.includes("mysql") ||
		name.includes("redis") ||
		name.includes("mongodb") ||
		name.includes("cassandra") ||
		name.includes("dynamodb") ||
		name.includes("elasticsearch")
	) {
		categories.push("databases");
	}

	// Cloud/Service providers
	if (
		name.includes("aws") ||
		name.includes("gcp") ||
		name.includes("azure") ||
		name.includes("s3") ||
		name.includes("sqs") ||
		name.includes("sns") ||
		name.includes("kinesis") ||
		name.includes("pubsub")
	) {
		categories.push("services");
	}

	// Messaging/Streaming
	if (
		name.includes("kafka") ||
		name.includes("nats") ||
		name.includes("rabbitmq") ||
		name.includes("mqtt")
	) {
		categories.push("messaging");
	}

	// File/Storage
	if (name.includes("file") || name.includes("sftp") || name.includes("ftp")) {
		categories.push("storage");
	}

	// HTTP/API
	if (
		name.includes("http") ||
		name.includes("webhook") ||
		name.includes("api")
	) {
		categories.push("api");
	}

	// If no specific category found, mark as general
	if (categories.length === 0) {
		categories.push("other");
	}

	return categories;
};
