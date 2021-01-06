package proto

type ConfigTopicMapping struct {
	TopicName string `yaml:"topicName"`

	// ProtoType is the proto's fully qualified name
	ProtoType string `yaml:"protoType"`
}
