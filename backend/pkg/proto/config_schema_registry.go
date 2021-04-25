package proto

// SchemaRegistryConfig that shall be used to get Protobuf types and Mappings from. The schema registry configuration
// is not part of this config as the schema registry client that is configured under kafka.schemaRegistry will be
// reused here. It is it's own configuration struct to remain extensible in the future without requiring breaking changes.
type SchemaRegistryConfig struct {
	Enabled bool `json:"enabled"`
}
