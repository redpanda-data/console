// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func TestUnifyLogDirs(t *testing.T) {
	tests := []struct {
		name     string
		logDirs  []kmsg.DescribeLogDirsResponseDir
		expected []kmsg.DescribeLogDirsResponseDir
	}{
		{
			name: "SingleLogDir",
			logDirs: []kmsg.DescribeLogDirsResponseDir{
				{
					Dir: "/var/lib/data",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      100,
								},
								{
									Partition: 1,
									Size:      200,
								},
							},
						},
					},
				},
			},
			expected: []kmsg.DescribeLogDirsResponseDir{
				{
					Dir: "/var/lib/data",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      100,
								},
								{
									Partition: 1,
									Size:      200,
								},
							},
						},
					},
				},
			},
		},

		{
			name: "MultiLogDirDifferentPartitionSizes",
			logDirs: []kmsg.DescribeLogDirsResponseDir{
				{
					Dir: "remote://s3-bucket",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      100,
								},
								{
									Partition: 1,
									Size:      500,
								},
							},
						},
					},
				},
				{
					Dir: "remote://s3-bucket",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      125,
								},
								{
									Partition: 1,
									Size:      155,
								},
							},
						},
					},
				},
			},
			expected: []kmsg.DescribeLogDirsResponseDir{
				{
					Dir: "remote://s3-bucket",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      125,
								},
								{
									Partition: 1,
									Size:      500,
								},
							},
						},
					},
				},
			},
		},

		{
			name: "MultiLogDirWithSomeResponsesMissingPartitions",
			logDirs: []kmsg.DescribeLogDirsResponseDir{
				{
					Dir: "remote://s3-bucket",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      100,
								},
								// Partition 1 missing on purpose here!
								{
									Partition: 2,
									Size:      5000,
								},
							},
						},
					},
				},
				{
					Dir: "remote://s3-bucket",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      300,
								},
								{
									Partition: 1,
									Size:      100,
								},
								{
									Partition: 2,
									Size:      500,
								},
							},
						},
					},
				},
			},
			expected: []kmsg.DescribeLogDirsResponseDir{
				{
					Dir: "remote://s3-bucket",
					Topics: []kmsg.DescribeLogDirsResponseDirTopic{
						{
							Topic: "topic-1",
							Partitions: []kmsg.DescribeLogDirsResponseDirTopicPartition{
								{
									Partition: 0,
									Size:      300,
								},
								{
									Partition: 1,
									Size:      100,
								},
								{
									Partition: 2,
									Size:      5000,
								},
							},
						},
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := unifyLogDirs(tt.logDirs)

			assert.Equal(t, tt.expected, result)
		})
	}
}
