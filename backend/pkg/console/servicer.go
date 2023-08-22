package console

import (
	"context"

	"github.com/cloudhut/common/rest"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/schema"
)

// Servicer is an interface for the Console package that offers all methods to serve the responses for the API layer.
type Servicer interface {
	GetAPIVersions(ctx context.Context) ([]APIVersion, error)
	GetAllBrokerConfigs(ctx context.Context) (map[int32]BrokerConfig, error)
	GetBrokerConfig(ctx context.Context, brokerID int32) ([]BrokerConfigEntry, *rest.Error)
	GetBrokersWithLogDirs(ctx context.Context) ([]BrokerWithLogDirs, error)
	GetClusterInfo(ctx context.Context) (*ClusterInfo, error)
	DeleteConsumerGroup(ctx context.Context, groupID string) error
	GetConsumerGroupsOverview(ctx context.Context, groupIDs []string) ([]ConsumerGroupOverview, *rest.Error)
	CreateACL(ctx context.Context, createReq kmsg.CreateACLsRequestCreation) *rest.Error
	CreateKafkaClient(_ context.Context, additionalOpts ...kgo.Opt) (*kgo.Client, error)
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
	ListMessages(ctx context.Context, listReq ListMessageRequest, progress kafka.IListMessagesProgress) error
	ListOffsets(ctx context.Context, topicNames []string, timestamp int64) ([]TopicOffset, error)
	GetOverview(ctx context.Context) Overview
	GetKafkaVersion(ctx context.Context) (string, error)
	ListPartitionReassignments(ctx context.Context) ([]PartitionReassignments, error)
	AlterPartitionAssignments(ctx context.Context, topics []kmsg.AlterPartitionAssignmentsRequestTopic) ([]AlterPartitionReassignmentsResponse, error)
	ProduceRecords(ctx context.Context, records []*kgo.Record, useTransactions bool, compressionType int8) ProduceRecordsResponse
	Start() error
	Stop()
	IsHealthy(ctx context.Context) error
	GetTopicConfigs(ctx context.Context, topicName string, configNames []string) (*TopicConfig, *rest.Error)
	GetTopicsConfigs(ctx context.Context, topicNames []string, configNames []string) (map[string]*TopicConfig, error)
	ListTopicConsumers(ctx context.Context, topicName string) ([]*TopicConsumerGroup, error)
	GetTopicDocumentation(topicName string) *TopicDocumentation
	GetTopicsOverview(ctx context.Context) ([]*TopicSummary, error)
	GetAllTopicNames(ctx context.Context, metadata *kmsg.MetadataResponse) ([]string, error)
	GetTopicDetails(ctx context.Context, topicNames []string) ([]TopicDetails, *rest.Error)

	GetSchemaRegistryMode(ctx context.Context) (*SchemaRegistryMode, error)
	GetSchemaRegistryConfig(ctx context.Context) (*SchemaRegistryConfig, error)
	PutSchemaRegistryConfig(ctx context.Context, compatLevel schema.CompatibilityLevel) (*SchemaRegistryConfig, error)
	GetSchemaRegistrySubjects(ctx context.Context) ([]SchemaRegistrySubject, error)
	GetSchemaRegistrySubjectDetails(ctx context.Context, subjectName string, version string) (*SchemaRegistrySubjectDetails, error)
	GetSchemaRegistrySchemaReferences(ctx context.Context, subjectName, version string) (*SchemaReferences, error)
	DeleteSchemaRegistrySubject(ctx context.Context, subjectName string, deletePermanently bool) (*SchemaRegistryDeleteSubjectResponse, error)
	DeleteSchemaRegistrySubjectVersion(ctx context.Context, subject, version string, deletePermanently bool) (*SchemaRegistryDeleteSubjectVersionResponse, error)
	GetSchemaRegistrySchemaTypes(ctx context.Context) (*SchemaRegistrySchemaTypes, error)
	CreateSchemaRegistrySchema(ctx context.Context, subjectName string, schema schema.Schema) (*CreateSchemaResponse, error)
	ValidateSchemaRegistrySchema(ctx context.Context, subjectName string, version string, schema schema.Schema) *SchemaRegistrySchemaValidation
}
