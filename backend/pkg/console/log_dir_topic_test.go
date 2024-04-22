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
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kfake"
	"github.com/twmb/franz-go/pkg/kmsg"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/testutil"
)

func TestTopicsSetWithLogDirs(t *testing.T) {
	t.Run("lookup on empty set", func(t *testing.T) {
		topicsSet := topicsSetWithLogDirs{}
		info, exists := topicsSet.Lookup("test", 0)
		assert.Empty(t, info)
		assert.False(t, exists)
	})

	t.Run("set on empty set", func(t *testing.T) {
		topicsSet := topicsSetWithLogDirs{}
		info := partitionInfo{
			PartitionID: 0,
			Replicas:    []int32{0, 1, 2},
			Leader:      0,
		}
		topicsSet.Set("test", info)
		partition, exists := topicsSet.Lookup("test", 0)
		assert.True(t, exists)
		require.NotNil(t, partition)
		assert.Equal(t, info, partition)
	})

	t.Run("update set", func(t *testing.T) {
		// 1. Set partition
		topic := "test"
		topicsSet := topicsSetWithLogDirs{}
		info := partitionInfo{
			PartitionID: 0,
			Replicas:    []int32{0, 1, 2},
			Leader:      0,
		}
		topicsSet.Set(topic, info)

		// 2. Retrieve partition and change leader
		info, exists := topicsSet.Lookup("test", 0)
		require.True(t, exists)
		require.NotNil(t, info)

		// 3. Set updated info
		info.Leader = 1
		topicsSet.Set(topic, info)

		// 4. Retrieve updated partition and ensure the leader is updated
		info, exists = topicsSet.Lookup(topic, 0)
		require.True(t, exists)
		require.NotNil(t, info)
		assert.Equal(t, int32(1), info.Leader)
	})

	t.Run("each partition", func(t *testing.T) {
		topic := "test"
		info := partitionInfo{
			PartitionID: 0,
			Replicas:    []int32{0, 1, 2},
			Leader:      0,
		}

		topicsSet := topicsSetWithLogDirs{}
		for i := 0; i < 30; i++ {
			info.PartitionID = int32(i)
			info.Leader = int32(i % 3)
			topicsSet.Set(topic, info)
		}

		retrievedPartitions := 0
		topicsSet.EachPartition(func(partitionInfo) {
			retrievedPartitions++
		})
		assert.Equal(t, 30, retrievedPartitions)
	})
}

func createMultiPartitionLogDir(dir, topic string, partitionIDsWithSize map[int32]int64) kmsg.DescribeLogDirsResponseDir {
	toPartitions := func(m map[int32]int64) []kmsg.DescribeLogDirsResponseDirTopicPartition {
		res := make([]kmsg.DescribeLogDirsResponseDirTopicPartition, 0, len(m))
		for partition, size := range m {
			res = append(res, kmsg.DescribeLogDirsResponseDirTopicPartition{
				Partition: partition,
				Size:      size,
				OffsetLag: 0,
				IsFuture:  false,
			})
		}
		return res
	}

	res := kmsg.NewDescribeLogDirsResponseDir()
	res.Dir = dir
	res.ErrorCode = 0
	res.Topics = []kmsg.DescribeLogDirsResponseDirTopic{
		{
			Topic:      topic,
			Partitions: toPartitions(partitionIDsWithSize),
		},
	}
	return res
}

func TestLogDirsByTopic(t *testing.T) {
	topicName := "test"

	t.Run("local and remote log dirs", func(t *testing.T) {
		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(3))
		require.NoError(t, err)
		t.Cleanup(fakeCluster.Close)

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()
			brokerID := fakeCluster.CurrentNode()

			switch v := req.(type) {
			case *kmsg.DescribeLogDirsRequest:
				// The following test case has 11k bytes on the remote directory for each partition, but
				// the brokers all report different sizes for the remote bucket as they are likely to lag
				// behind a bit in production.
				// The local log dir size is different for each partition.
				response, ok := v.ResponseKind().(*kmsg.DescribeLogDirsResponse)
				require.True(t, ok)
				switch brokerID {
				case 0:
					response.Dirs = []kmsg.DescribeLogDirsResponseDir{
						createMultiPartitionLogDir("/etc/kafka/data", topicName, map[int32]int64{
							0: 300,  // Leader
							1: 1000, // Replica, 50 bytes behind
							2: 500,  // Replica
						}),
						createMultiPartitionLogDir("remote://s3-bucket", topicName, map[int32]int64{
							0: 11000, // Leader
							1: 10000,
							2: 10000,
						}),
					}
				case 1:
					response.Dirs = []kmsg.DescribeLogDirsResponseDir{
						createMultiPartitionLogDir("/etc/kafka/data", topicName, map[int32]int64{
							0: 300,  // Replica
							1: 1050, // Leader
							2: 500,  // Replica
						}),
						createMultiPartitionLogDir("remote://s3-bucket", topicName, map[int32]int64{
							0: 11000,
							1: 11000, // Leader
							2: 8000,
						}),
					}
				case 2:
					response.Dirs = []kmsg.DescribeLogDirsResponseDir{
						createMultiPartitionLogDir("/etc/kafka/data", topicName, map[int32]int64{
							0: 300,  // Replica
							1: 1000, // Replica, 50 bytes behind
							2: 500,  // Leader
						}),
						createMultiPartitionLogDir("remote://s3-bucket", topicName, map[int32]int64{
							0: 8000,
							1: 10500,
							2: 11000, // Leader
						}),
					}
				}
				return response, nil, true
			case *kmsg.MetadataRequest, *kmsg.ApiVersionsRequest, *kmsg.CreateTopicsRequest:
				return nil, nil, false
			default:
				assert.Fail(t, fmt.Sprintf("unexpected call to fake kafka request %T", v))
				return nil, nil, false
			}
		})

		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()

		_, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())
		_, err = fakeAdminClient.CreateTopic(ctx, 3, 3, nil, topicName)
		require.NoError(t, err)

		require.NoError(t, fakeCluster.MoveTopicPartition(topicName, 0, 0))
		require.NoError(t, fakeCluster.MoveTopicPartition(topicName, 1, 1))
		require.NoError(t, fakeCluster.MoveTopicPartition(topicName, 2, 2))

		consoleSvc := Service{
			kafkaSvc: &kafka.Service{
				KafkaAdmClient: fakeAdminClient,
			},
			logger: zap.NewNop(),
		}

		logDirsByTopic, err := consoleSvc.logDirsByTopic(context.Background())
		require.NoError(t, err)
		require.Len(t, logDirsByTopic, 1)
		require.NotNil(t, logDirsByTopic[topicName])
		// Total size is: 38450b
		// Partition 0: 300b local on primary + 600b local on replicas + 11000 remote = 11900
		// Partition 1: 1050b local on primary + 2000b local on replicas + 11000 remote = 14050
		// Partition 3: 500b local on primary + 1000b local on replicas + 11000 remote = 12500
		assert.Equal(t, int64(38450), logDirsByTopic[topicName].TotalSizeBytes)
	})

	t.Run("local dirs only and one broker offline", func(t *testing.T) {
		fakeCluster, err := kfake.NewCluster(kfake.NumBrokers(3))
		require.NoError(t, err)
		t.Cleanup(fakeCluster.Close)

		fakeCluster.Control(func(req kmsg.Request) (kmsg.Response, error, bool) {
			fakeCluster.KeepControl()
			brokerID := fakeCluster.CurrentNode()

			switch v := req.(type) {
			case *kmsg.DescribeLogDirsRequest:
				response, ok := v.ResponseKind().(*kmsg.DescribeLogDirsResponse)
				require.True(t, ok)

				switch brokerID {
				case 0:
					return nil, nil, true // Timeout
				case 1:
					response.Dirs = []kmsg.DescribeLogDirsResponseDir{
						createMultiPartitionLogDir("/etc/kafka/data", topicName, map[int32]int64{
							0: 300,  // Leader
							1: 1050, // Leader
							2: 500,  // Replica
						}),
					}
				case 2:
					response.Dirs = []kmsg.DescribeLogDirsResponseDir{
						createMultiPartitionLogDir("/etc/kafka/data", topicName, map[int32]int64{
							0: 300,  // Replica
							1: 1000, // Replica, 50 bytes behind
							2: 500,  // Leader
						}),
					}
				}
				return response, nil, true
			case *kmsg.MetadataRequest, *kmsg.ApiVersionsRequest, *kmsg.CreateTopicsRequest:
				return nil, nil, false
			default:
				assert.Fail(t, fmt.Sprintf("unexpected call to fake kafka request %T", v))
				return nil, nil, false
			}
		})

		ctx, cancel := context.WithTimeout(context.Background(), 6*time.Second)
		defer cancel()

		_, fakeAdminClient := testutil.CreateClients(t, fakeCluster.ListenAddrs())
		_, err = fakeAdminClient.CreateTopic(ctx, 3, 3, nil, topicName)
		require.NoError(t, err)

		require.NoError(t, fakeCluster.MoveTopicPartition(topicName, 0, 0))
		require.NoError(t, fakeCluster.MoveTopicPartition(topicName, 1, 1))
		require.NoError(t, fakeCluster.MoveTopicPartition(topicName, 2, 2))

		consoleSvc := Service{
			kafkaSvc: &kafka.Service{
				KafkaAdmClient: fakeAdminClient,
			},
			logger: zap.NewNop(),
		}

		logDirsByTopic, err := consoleSvc.logDirsByTopic(context.Background())
		require.NoError(t, err)
		require.Len(t, logDirsByTopic, 1)
		require.NotNil(t, logDirsByTopic[topicName])
		// Total size is: 3650b
		// Partition 0: 300b on primary + 300b on replica
		// Partition 1: 1050b on primary + 1000b on replica
		// Partition 2: 500b on primary + 500b on replica
		assert.Equal(t, int64(3650), logDirsByTopic[topicName].TotalSizeBytes)
	})
}
