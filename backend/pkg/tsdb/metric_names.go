package tsdb

const (
	// Topic Metrics
	MetricNameKafkaTopicSize                string = "kafka_topic_size_bytes"
	MetricNameKafkaTopicPartitionLeaderSize string = "kafka_topic_partition_leader_size_bytes"
	MetricNameKafkaTopicPartitionTotalSize  string = "kafka_topic_partition_total_size_bytes"
	MetricNameKafkaTopicHighWaterMarkSum    string = "kafka_topic_partition_high_water_mark"

	// ConsumerGroup Lags
	MetricNameKafkaConsumerGroupSummedTopicLag string = "kafka_consumer_group_summed_topic_lag"
)
