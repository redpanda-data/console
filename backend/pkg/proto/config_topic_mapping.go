package proto

type ConfigTopicMapping struct {
	TopicName string `koanf:"topicName"`

	// KeyProtoType is the proto's fully qualified name that shall be used for a Kafka record's key
	KeyProtoType string `koanf:"keyProtoType"`

	// ValueProtoType is the proto's fully qualified name that shall be used for a Kafka record's value
	ValueProtoType string `koanf:"valueProtoType"`
}
