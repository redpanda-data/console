// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

func consumerGroupOverviewToProto(g *console.ConsumerGroupOverview) *v1alpha.ConsumerGroupOverview {
	protoMembers := make([]*v1alpha.GroupMemberDescription, 0, len(g.Members))
	for _, m := range g.Members {
		protoAssignments := make([]*v1alpha.GroupMemberAssignment, 0, len(m.Assignments))
		for _, a := range m.Assignments {
			protoAssignments = append(protoAssignments, &v1alpha.GroupMemberAssignment{
				TopicName:    a.TopicName,
				PartitionIds: a.PartitionIDs,
			})
		}
		protoMembers = append(protoMembers, &v1alpha.GroupMemberDescription{
			Id:          m.ID,
			ClientId:    m.ClientID,
			ClientHost:  m.ClientHost,
			Assignments: protoAssignments,
		})
	}

	protoOffsets := make([]*v1alpha.GroupTopicOffsets, 0, len(g.TopicOffsets))
	for _, to := range g.TopicOffsets {
		protoPartitionOffsets := make([]*v1alpha.PartitionOffset, 0, len(to.PartitionOffsets))
		for _, po := range to.PartitionOffsets {
			protoPartitionOffsets = append(protoPartitionOffsets, &v1alpha.PartitionOffset{
				Error:         po.Error,
				PartitionId:   po.PartitionID,
				GroupOffset:   po.GroupOffset,
				HighWaterMark: po.HighWaterMark,
				Lag:           po.Lag,
			})
		}
		protoOffsets = append(protoOffsets, &v1alpha.GroupTopicOffsets{
			Topic:                to.Topic,
			SummedLag:            to.SummedLag,
			PartitionCount:       int32(to.PartitionCount),
			PartitionsWithOffset: int32(to.PartitionsWithOffset),
			PartitionOffsets:     protoPartitionOffsets,
		})
	}

	return &v1alpha.ConsumerGroupOverview{
		GroupId:       g.GroupID,
		State:         g.State,
		ProtocolType:  g.ProtocolType,
		Protocol:      g.Protocol,
		Members:       protoMembers,
		CoordinatorId: g.CoordinatorID,
		TopicOffsets:  protoOffsets,
	}
}

func brokerWithLogDirsToProto(b *console.BrokerWithLogDirs) *v1alpha.BrokerWithLogDirs {
	pb := &v1alpha.BrokerWithLogDirs{
		BrokerId:     b.BrokerID,
		IsController: b.IsController,
		Address:      b.Address,
	}
	if b.Rack != nil {
		pb.Rack = b.Rack
	}
	if b.TotalLogDirSizeBytes != nil {
		pb.TotalLogDirSizeBytes = b.TotalLogDirSizeBytes
	}
	if b.TotalPrimaryLogDirSizeBytes != nil {
		pb.TotalPrimaryLogDirSizeBytes = b.TotalPrimaryLogDirSizeBytes
	}
	return pb
}

func clusterInfoToProto(ci *console.ClusterInfo) *v1alpha.ClusterInfo {
	if ci == nil {
		return nil
	}

	protoBrokers := make([]*v1alpha.ClusterBroker, 0, len(ci.Brokers))
	for _, b := range ci.Brokers {
		pb := &v1alpha.ClusterBroker{
			BrokerId:   b.BrokerID,
			LogDirSize: b.LogDirSize,
			Address:    b.Address,
			Config:     brokerConfigToProto(&b.Config),
		}
		if b.Rack != nil {
			pb.Rack = b.Rack
		}
		protoBrokers = append(protoBrokers, pb)
	}

	return &v1alpha.ClusterInfo{
		ControllerId: ci.ControllerID,
		Brokers:      protoBrokers,
		KafkaVersion: ci.KafkaVersion,
	}
}

func brokerConfigToProto(bc *console.BrokerConfig) *v1alpha.ClusterBrokerConfig {
	protoEntries := make([]*v1alpha.ClusterBrokerConfigEntry, 0, len(bc.Configs))
	for _, c := range bc.Configs {
		protoEntries = append(protoEntries, &v1alpha.ClusterBrokerConfigEntry{
			Name:           c.Name,
			Value:          c.Value,
			Source:         c.Source,
			Type:           c.Type,
			IsExplicitlySet: c.IsExplicitlySet,
			IsDefaultValue: c.IsDefaultValue,
			IsSensitive:    c.IsSensitive,
			IsReadOnly:     c.IsReadOnly,
		})
	}
	return &v1alpha.ClusterBrokerConfig{
		Configs: protoEntries,
		Error:   bc.Error,
	}
}

func topicSummaryToProto(t *console.TopicSummary) *v1alpha.TopicSummary {
	return &v1alpha.TopicSummary{
		TopicName:         t.TopicName,
		IsInternal:        t.IsInternal,
		PartitionCount:    int32(t.PartitionCount),
		ReplicationFactor: int32(t.ReplicationFactor),
		CleanupPolicy:     t.CleanupPolicy,
		Documentation:     string(t.Documentation),
		LogDirSummary: &v1alpha.TopicLogDirSummary{
			TotalSizeBytes: t.LogDirSummary.TotalSizeBytes,
			Hint:           t.LogDirSummary.Hint,
		},
	}
}

func topicPartitionDetailToProto(p *console.TopicPartitionDetails) *v1alpha.TopicPartitionDetail {
	protoLogDirs := make([]*v1alpha.TopicPartitionLogDir, 0, len(p.PartitionLogDirs))
	for _, ld := range p.PartitionLogDirs {
		protoLogDirs = append(protoLogDirs, &v1alpha.TopicPartitionLogDir{
			BrokerId:    ld.BrokerID,
			Error:       ld.Error,
			PartitionId: ld.PartitionID,
			Size:        ld.Size,
		})
	}

	return &v1alpha.TopicPartitionDetail{
		Id:               p.ID,
		PartitionError:   p.PartitionError,
		Replicas:         p.Replicas,
		OfflineReplicas:  p.OfflineReplicas,
		InSyncReplicas:   p.InSyncReplicas,
		Leader:           p.Leader,
		WaterMarksError:  p.WaterMarksError,
		WaterMarkLow:     p.WaterMarkLow,
		WaterMarkHigh:    p.WaterMarkHigh,
		PartitionLogDirs: protoLogDirs,
	}
}

func topicConfigToProto(tc *console.TopicConfig) *v1alpha.TopicConfig {
	protoEntries := make([]*v1alpha.TopicConfigEntry, 0, len(tc.ConfigEntries))
	for _, e := range tc.ConfigEntries {
		protoEntries = append(protoEntries, &v1alpha.TopicConfigEntry{
			Name:           e.Name,
			Value:          e.Value,
			Source:         e.Source,
			Type:           e.Type,
			IsExplicitlySet: e.IsExplicitlySet,
			IsDefaultValue: e.IsDefaultValue,
			IsSensitive:    e.IsSensitive,
			IsReadOnly:     e.IsReadOnly,
			Documentation:  e.Documentation,
		})
	}

	var protoError *v1alpha.KafkaError
	if tc.Error != nil {
		protoError = &v1alpha.KafkaError{
			Code:        int32(tc.Error.Code),
			Message:     tc.Error.Message,
			Description: tc.Error.Description,
		}
	}

	return &v1alpha.TopicConfig{
		TopicName:     tc.TopicName,
		ConfigEntries: protoEntries,
		Error:         protoError,
	}
}
