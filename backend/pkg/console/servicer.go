package console

import (
	"context"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/sr"

	"github.com/redpanda-data/console/backend/pkg/serde"
)

// Servicer is an interface for the Console package that offers all methods to serve the responses for the API layer.
// It may also be used to virtualize Console to serve many virtual clusters with a single Console deployment.
type Servicer interface {
	SchemaRegistryServicer

	GetAPIVersions(ctx context.Context) ([]APIVersion, error)
	GetAllBrokerConfigs(ctx context.Context) (map[int32]BrokerConfig, error)
	GetBrokerConfig(ctx context.Context, brokerID int32) ([]BrokerConfigEntry, *rest.Error)
	GetBrokersWithLogDirs(ctx context.Context) ([]BrokerWithLogDirs, error)
	GetClusterInfo(ctx context.Context) (*ClusterInfo, error)
	DeleteConsumerGroup(ctx context.Context, groupID string) error
	GetConsumerGroupsOverview(ctx context.Context, groupIDs []string) ([]ConsumerGroupOverview, *rest.Error)
	CreateACL(ctx context.Context, createReq kmsg.CreateACLsRequestCreation) *rest.Error
	CreateTopic(ctx context.Context, createTopicReq kmsg.CreateTopicsRequestTopic) (CreateTopicResponse, *rest.Error)
	DeleteACLs(ctx context.Context, filter kmsg.DeleteACLsRequestFilter) (DeleteACLsResponse, *rest.Error)
	DeleteConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetDeleteRequestTopic) ([]DeleteConsumerGroupOffsetsResponseTopic, error)
	DeleteTopic(ctx context.Context, topicName string) *rest.Error
	DeleteTopicRecords(ctx context.Context, deleteReq kmsg.DeleteRecordsRequestTopic) (DeleteTopicRecordsResponse, *rest.Error)
	DescribeQuotas(ctx context.Context) QuotaResponse
	EditConsumerGroupOffsets(ctx context.Context, groupID string, topics []kmsg.OffsetCommitRequestTopic) (*EditConsumerGroupOffsetsResponse, *rest.Error)
	EditTopicConfig(ctx context.Context, topicName string, configs []kmsg.IncrementalAlterConfigsRequestResourceConfig) error
	GetEndpointCompatibility(ctx context.Context) (EndpointCompatibility, error)
	IncrementalAlterConfigs(ctx context.Context, alterConfigs []kmsg.IncrementalAlterConfigsRequestResource) ([]IncrementalAlterConfigsResourceResponse, *rest.Error)
	ListAllACLs(ctx context.Context, req kmsg.DescribeACLsRequest) (*ACLOverview, error)
	ListMessages(ctx context.Context, listReq ListMessageRequest, progress IListMessagesProgress) error
	ListOffsets(ctx context.Context, topicNames []string, timestamp int64) ([]TopicOffset, error)
	GetKafkaVersion(ctx context.Context) (string, error)
	ListPartitionReassignments(ctx context.Context) ([]PartitionReassignments, error)
	AlterPartitionAssignments(ctx context.Context, topics []kmsg.AlterPartitionAssignmentsRequestTopic) ([]AlterPartitionReassignmentsResponse, error)
	ProducePlainRecords(ctx context.Context, records []*kgo.Record, useTransactions bool, compressionOpts []kgo.CompressionCodec) ProduceRecordsResponse
	ProduceRecord(context.Context, string, int32, []kgo.RecordHeader, *serde.RecordPayloadInput, *serde.RecordPayloadInput, bool, []kgo.CompressionCodec) (*ProduceRecordResponse, error)
	Start(ctx context.Context) error
	Stop()
	GetTopicConfigs(ctx context.Context, topicName string, configNames []string) (*TopicConfig, *rest.Error)
	GetTopicsConfigs(ctx context.Context, topicNames []string, configNames []string) (map[string]*TopicConfig, error)
	ListTopicConsumers(ctx context.Context, topicName string) ([]*TopicConsumerGroup, error)
	GetTopicDocumentation(topicName string) *TopicDocumentation
	GetTopicsOverview(ctx context.Context) ([]*TopicSummary, error)
	GetAllTopicNames(ctx context.Context) ([]string, error)
	GetTopicDetails(ctx context.Context, topicNames []string) ([]TopicDetails, *rest.Error)

	// ------------------------------------------------------------------
	// Plain Kafka requests, used by Connect API.
	// The Console service was supposed to be a translation layer between the API (REST)
	// and the Kafka package, but it's also used for virtualizing Console. Thus, even
	// plain Kafka requests need to go through this package.
	// ------------------------------------------------------------------

	// CreateACLs proxies the request/response to CreateACLs via the Kafka API.
	CreateACLs(ctx context.Context, createReq *kmsg.CreateACLsRequest) (*kmsg.CreateACLsResponse, error)
	// DeleteACLsKafka proxies the request/response via the Kafka API.
	DeleteACLsKafka(ctx context.Context, deleteReq *kmsg.DeleteACLsRequest) (*kmsg.DeleteACLsResponse, error)
	// CreateTopics proxies the request/response to create topics via the Kafka API.
	CreateTopics(ctx context.Context, createReq *kmsg.CreateTopicsRequest) (*kmsg.CreateTopicsResponse, error)
	// DescribeConfigs proxies the request/response for describing topic or broker configs via
	// the Kafka API.
	DescribeConfigs(ctx context.Context, req *kmsg.DescribeConfigsRequest) (*kmsg.DescribeConfigsResponse, error)
	// DeleteTopics proxies the request/response to delete topics via the Kafka API.
	DeleteTopics(ctx context.Context, deleteReq *kmsg.DeleteTopicsRequest) (*kmsg.DeleteTopicsResponse, error)
	// GetMetadata proxies the request/response to retrieve metadata via the Kafka API.
	GetMetadata(ctx context.Context, metadataReq *kmsg.MetadataRequest) (*kmsg.MetadataResponse, error)
	// IncrementalAlterConfigsKafka proxies the request/response to incrementally alter configs via the Kafka API.
	IncrementalAlterConfigsKafka(ctx context.Context, req *kmsg.IncrementalAlterConfigsRequest) (*kmsg.IncrementalAlterConfigsResponse, error)
	// AlterConfigs proxies the request/response to set configs (not incrementally) via the Kafka API.
	AlterConfigs(ctx context.Context, req *kmsg.AlterConfigsRequest) (*kmsg.AlterConfigsResponse, error)
	// Adds partitions to existing topics.
	AddPartitionsToTopics(ctx context.Context, add int, topicNames []string, validateOnly bool) (kadm.CreatePartitionsResponses, error)
	// Sets partition counts to existing topics.
	SetPartitionsToTopics(ctx context.Context, add int, topicNames []string, validateOnly bool) (kadm.CreatePartitionsResponses, error)
	// DescribeClientQuotas proxies the request/response for describing client quotas via the Kafka API.
	DescribeClientQuotas(ctx context.Context, req *kmsg.DescribeClientQuotasRequest) (*kmsg.DescribeClientQuotasResponse, error)
	// AlterClientQuotas proxies the request/response for altering client quotas via the Kafka API.
	AlterClientQuotas(ctx context.Context, req *kmsg.AlterClientQuotasRequest) (*kmsg.AlterClientQuotasResponse, error)
}

// SchemaRegistryServicer is the interface for schema registry servicer
type SchemaRegistryServicer interface {
	GetSchemaRegistryMode(ctx context.Context) (*SchemaRegistryMode, error)
	GetSchemaRegistryConfig(ctx context.Context, subject string) (*SchemaRegistryConfig, error)
	PutSchemaRegistryConfig(ctx context.Context, subject string, compatibility sr.SetCompatibility) (*SchemaRegistryConfig, error)
	DeleteSchemaRegistrySubjectConfig(ctx context.Context, subject string) error
	GetSchemaRegistrySubjects(ctx context.Context) ([]SchemaRegistrySubject, error)
	GetSchemaRegistrySubjectDetails(ctx context.Context, subjectName string, version string) (*SchemaRegistrySubjectDetails, error)
	GetSchemaRegistrySchemaReferencedBy(ctx context.Context, subjectName string, version int) ([]SchemaReference, error)
	DeleteSchemaRegistrySubject(ctx context.Context, subjectName string, deletePermanently bool) (*SchemaRegistryDeleteSubjectResponse, error)
	DeleteSchemaRegistrySubjectVersion(ctx context.Context, subject string, version int, deletePermanently bool) (*SchemaRegistryDeleteSubjectVersionResponse, error)
	GetSchemaRegistrySchemaTypes(ctx context.Context) (*SchemaRegistrySchemaTypes, error)
	CreateSchemaRegistrySchema(ctx context.Context, subjectName string, schema sr.Schema) (*CreateSchemaResponse, error)
	ValidateSchemaRegistrySchema(ctx context.Context, subjectName string, version int, schema sr.Schema) (*SchemaRegistrySchemaValidation, error)
	GetSchemaUsagesByID(ctx context.Context, schemaID int) ([]SchemaVersion, error)
}
