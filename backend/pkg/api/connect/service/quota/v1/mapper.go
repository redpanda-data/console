// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package quota

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

const (
	clientIDEntityType       = "client-id"
	clientIDPrefixEntityType = "client-id-prefix"
	userEntityType           = "user"
	ipEntityType             = "ip"

	producerByteRateKey       = "producer_byte_rate"
	consumerByteRateKey       = "consumer_byte_rate"
	controllerMutationRateKey = "controller_mutation_rate"
	requestPercentageKey      = "request_percentage"

	defaultEntityValue = "<default>"
)

type kafkaClientMapper struct{}

func (kafkaClientMapper) listQuotasRequestToKafka(req *v1.ListQuotasRequest) *kmsg.DescribeClientQuotasRequest {
	var (
		entityType string
		matchType  kmsg.QuotasMatchType
		match      *string
	)

	// Match entity type and filter type from the request
	switch req.Filter.GetEntityType() {
	case v1.Quota_ENTITY_TYPE_CLIENT_ID:
		entityType = clientIDEntityType
	case v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX:
		entityType = clientIDPrefixEntityType
	case v1.Quota_ENTITY_TYPE_USER:
		entityType = userEntityType

	case v1.Quota_ENTITY_TYPE_IP:
		entityType = ipEntityType

	default:
		return &kmsg.DescribeClientQuotasRequest{}
	}

	switch {
	case req.Filter.MatchDefault:
		matchType = kmsg.QuotasMatchTypeDefault
	case req.Filter.GetEntityName() == "":
		matchType = kmsg.QuotasMatchTypeAny
	default:
		match = &req.Filter.EntityName
		matchType = kmsg.QuotasMatchTypeExact
	}

	return &kmsg.DescribeClientQuotasRequest{
		Components: []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: entityType,
				MatchType:  matchType,
				Match:      match,
			},
		},
	}
}

// quotaItemsToProto maps console quota items to protobuf response.
func (k kafkaClientMapper) quotaItemsToProto(entries []kmsg.DescribeClientQuotasResponseEntry) ([]*v1.ListQuotasResponse_QuotaEntry, error) {
	var quotaEntries []*v1.ListQuotasResponse_QuotaEntry

	for _, entry := range entries {
		values, err := k.mapQuotaValues(entry.Values)
		if err != nil {
			return nil, err
		}

		for _, entity := range entry.Entity {
			quotaEntry, err := k.mapQuotaEntry(entity, values)
			if err != nil {
				return nil, err
			}
			quotaEntries = append(quotaEntries, quotaEntry)
		}
	}

	return quotaEntries, nil
}

// mapQuotaValues converts Kafka quota values to protobuf values.
func (k kafkaClientMapper) mapQuotaValues(values []kmsg.DescribeClientQuotasResponseEntryValue) ([]*v1.Quota_Value, error) {
	var protoValues []*v1.Quota_Value

	for _, value := range values {
		valueType, err := k.mapKeyToValueType(value.Key)
		if err != nil {
			return nil, err
		}

		protoValues = append(protoValues, &v1.Quota_Value{
			ValueType: valueType,
			Value:     value.Value,
		})
	}

	return protoValues, nil
}

// mapQuotaEntry creates a protobuf quota entry from Kafka entity and values.
func (k kafkaClientMapper) mapQuotaEntry(entity kmsg.DescribeClientQuotasResponseEntryEntity, values []*v1.Quota_Value) (*v1.ListQuotasResponse_QuotaEntry, error) {
	entityType, err := k.mapKafkaEntityType(entity.Type)
	if err != nil {
		return nil, err
	}

	entityName := defaultEntityValue
	if entity.Name != nil {
		entityName = *entity.Name
	}

	return &v1.ListQuotasResponse_QuotaEntry{
		Entity: &v1.Quota_Entity{
			EntityType: entityType,
			EntityName: entityName,
		},
		Values: values,
	}, nil
}

// mapKeyToValueType converts Kafka quota key to protobuf value type.
func (kafkaClientMapper) mapKeyToValueType(key string) (v1.Quota_ValueType, error) {
	switch key {
	case producerByteRateKey:
		return v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE, nil
	case consumerByteRateKey:
		return v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE, nil
	case controllerMutationRateKey:
		return v1.Quota_VALUE_TYPE_CONTROLLER_MUTATION_RATE, nil
	case requestPercentageKey:
		return v1.Quota_VALUE_TYPE_REQUEST_PERCENTAGE, nil
	default:
		return 0, fmt.Errorf("invalid value type: %s", key)
	}
}

// mapKafkaEntityType converts Kafka entity type to protobuf entity type.
func (kafkaClientMapper) mapKafkaEntityType(entityType string) (v1.Quota_EntityType, error) {
	switch entityType {
	case clientIDEntityType:
		return v1.Quota_ENTITY_TYPE_CLIENT_ID, nil
	case clientIDPrefixEntityType:
		return v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX, nil
	case userEntityType:
		return v1.Quota_ENTITY_TYPE_USER, nil
	case ipEntityType:
		return v1.Quota_ENTITY_TYPE_IP, nil
	default:
		return 0, fmt.Errorf("invalid entity type: %s", entityType)
	}
}

func (k kafkaClientMapper) alterQuotaRequestToKafka(entities []*v1.RequestQuotaEntity, operations []kmsg.AlterClientQuotasRequestEntryOp) (*kmsg.AlterClientQuotasRequest, error) {
	var entries []kmsg.AlterClientQuotasRequestEntry

	for _, entity := range entities {
		entityType, err := k.mapEntityType(entity.EntityType)
		if err != nil {
			return nil, err
		}

		entityName := k.mapEntityName(entity)

		entries = append(entries, kmsg.AlterClientQuotasRequestEntry{
			Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
				{
					Type: entityType,
					Name: entityName,
				},
			},
			Ops: operations,
		})
	}

	return &kmsg.AlterClientQuotasRequest{
		Entries: entries,
	}, nil
}

func (k kafkaClientMapper) batchSetQuotaRequestToKafka(req *v1.BatchSetQuotaRequest) (*kmsg.AlterClientQuotasRequest, error) {
	var entries []kmsg.AlterClientQuotasRequestEntry

	for _, setting := range req.Settings {
		entry, err := k.createKafkaEntryWithValues(setting.Entity, setting.Values, false)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return &kmsg.AlterClientQuotasRequest{
		Entries: entries,
	}, nil
}

func (k kafkaClientMapper) deleteQuotaRequestToKafka(req *v1.DeleteQuotaRequest) (*kmsg.AlterClientQuotasRequest, error) {
	key, err := k.mapValueTypeToKey(req.ValueType)
	if err != nil {
		return nil, err
	}

	operations := []kmsg.AlterClientQuotasRequestEntryOp{
		{
			Key:    key,
			Remove: true,
		},
	}

	entities := []*v1.RequestQuotaEntity{req.Entity}
	return k.alterQuotaRequestToKafka(entities, operations)
}

func (k kafkaClientMapper) setQuotaRequestToKafka(req *v1.SetQuotaRequest) (*kmsg.AlterClientQuotasRequest, error) {
	key, err := k.mapValueTypeToKey(req.Value.ValueType)
	if err != nil {
		return nil, err
	}

	operations := []kmsg.AlterClientQuotasRequestEntryOp{
		{
			Key:    key,
			Value:  float64(req.Value.Value),
			Remove: false,
		},
	}

	entities := []*v1.RequestQuotaEntity{req.Entity}
	return k.alterQuotaRequestToKafka(entities, operations)
}

func (k kafkaClientMapper) batchDeleteQuotaRequestToKafka(req *v1.BatchDeleteQuotaRequest) (*kmsg.AlterClientQuotasRequest, error) {
	var entries []kmsg.AlterClientQuotasRequestEntry

	for _, deletion := range req.Deletions {
		// Map deletion values to QuotaValue with 0 value. This keeps the API consistent with the single deletion case.
		// Also keeps the api clear for deletion of specific value types.
		values := make([]*v1.RequestQuotaValue, len(deletion.ValueTypes))
		for i, valueType := range deletion.ValueTypes {
			values[i] = &v1.RequestQuotaValue{
				ValueType: valueType,
			}
		}

		entry, err := k.createKafkaEntryWithValues(deletion.Entity, values, true)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}

	return &kmsg.AlterClientQuotasRequest{
		Entries: entries,
	}, nil
}

func (kafkaClientMapper) mapEntityType(entityType v1.Quota_EntityType) (string, error) {
	switch entityType {
	case v1.Quota_ENTITY_TYPE_CLIENT_ID:
		return clientIDEntityType, nil
	case v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX:
		return clientIDPrefixEntityType, nil
	case v1.Quota_ENTITY_TYPE_USER:
		return userEntityType, nil
	case v1.Quota_ENTITY_TYPE_IP:
		return ipEntityType, nil
	default:
		return "", fmt.Errorf("invalid entity type: %v", entityType)
	}
}

// mapEntityName sets default entity name if not provided.
func (kafkaClientMapper) mapEntityName(entity *v1.RequestQuotaEntity) *string {
	if entity.EntityName == "" || entity.EntityName == defaultEntityValue {
		return nil
	}
	return &entity.EntityName
}

// mapValueTypeToKey converts protobuf value type to Kafka quota key.
func (kafkaClientMapper) mapValueTypeToKey(valueType v1.Quota_ValueType) (string, error) {
	switch valueType {
	case v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE:
		return producerByteRateKey, nil
	case v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE:
		return consumerByteRateKey, nil
	case v1.Quota_VALUE_TYPE_CONTROLLER_MUTATION_RATE:
		return controllerMutationRateKey, nil
	case v1.Quota_VALUE_TYPE_REQUEST_PERCENTAGE:
		return requestPercentageKey, nil

	default:
		return "", fmt.Errorf("invalid value type: %v", valueType)
	}
}

// mapKafkaEntityFromAlterResponse converts entities from AlterClientQuotas response to proto format
func (k kafkaClientMapper) mapKafkaEntityFromAlterResponse(entities []kmsg.AlterClientQuotasResponseEntryEntity) (v1.Quota_EntityType, string) {
	// Take the first entity (typically there's only one per entry)
	entity := entities[0]

	entityType, err := k.mapKafkaEntityType(entity.Type)
	if err != nil {
		entityType = v1.Quota_ENTITY_TYPE_UNSPECIFIED
	}

	entityName := ""
	if entity.Name != nil {
		entityName = *entity.Name
	}

	return entityType, entityName
}

// mapAlterClientQuotasResponse converts AlterClientQuotas response entries to successful and failed entities
func (k kafkaClientMapper) mapAlterClientQuotasResponse(entries []kmsg.AlterClientQuotasResponseEntry) ([]*v1.QuotaOperationResult_SuccessfulEntity, []*v1.QuotaOperationResult_FailedEntity) {
	var successfulEntities []*v1.QuotaOperationResult_SuccessfulEntity
	var failedEntities []*v1.QuotaOperationResult_FailedEntity

	for _, entry := range entries {
		// Skip entries with no entity information
		if len(entry.Entity) == 0 {
			continue
		}

		entityType, entityName := k.mapKafkaEntityFromAlterResponse(entry.Entity)

		if entry.ErrorCode == 0 {
			successfulEntities = append(successfulEntities, &v1.QuotaOperationResult_SuccessfulEntity{
				EntityType: entityType,
				EntityName: entityName,
			})
			continue
		}

		errorMessage := ""
		if entry.ErrorMessage != nil {
			errorMessage = *entry.ErrorMessage
		}
		failedEntities = append(failedEntities, &v1.QuotaOperationResult_FailedEntity{
			EntityType:   entityType,
			EntityName:   entityName,
			ErrorCode:    int32(entry.ErrorCode),
			ErrorMessage: errorMessage,
		})
	}

	return successfulEntities, failedEntities
}

// createOperation creates a quota operation with the given parameters
func (k kafkaClientMapper) createOperation(valueType v1.Quota_ValueType, value float64, remove bool) (kmsg.AlterClientQuotasRequestEntryOp, error) {
	key, err := k.mapValueTypeToKey(valueType)
	if err != nil {
		return kmsg.AlterClientQuotasRequestEntryOp{}, err
	}

	return kmsg.AlterClientQuotasRequestEntryOp{
		Key:    key,
		Value:  value,
		Remove: remove,
	}, nil
}

// createKafkaEntry creates a Kafka entry for a given entity and operations
func (k kafkaClientMapper) createKafkaEntry(entity *v1.RequestQuotaEntity, operations []kmsg.AlterClientQuotasRequestEntryOp) (kmsg.AlterClientQuotasRequestEntry, error) {
	entityType, err := k.mapEntityType(entity.EntityType)
	if err != nil {
		return kmsg.AlterClientQuotasRequestEntry{}, err
	}

	entityName := k.mapEntityName(entity)

	return kmsg.AlterClientQuotasRequestEntry{
		Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
			{
				Type: entityType,
				Name: entityName,
			},
		},
		Ops: operations,
	}, nil
}

// createKafkaEntryWithValues creates a Kafka entry from an entity and either values or value types
func (k kafkaClientMapper) createKafkaEntryWithValues(entity *v1.RequestQuotaEntity, values []*v1.RequestQuotaValue, remove bool) (kmsg.AlterClientQuotasRequestEntry, error) {
	var operations []kmsg.AlterClientQuotasRequestEntryOp

	for _, value := range values {
		op, err := k.createOperation(value.ValueType, value.Value, remove)
		if err != nil {
			return kmsg.AlterClientQuotasRequestEntry{}, err
		}
		operations = append(operations, op)
	}

	// Create entry with the operations
	return k.createKafkaEntry(entity, operations)
}
