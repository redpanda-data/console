const kindTypeLogos: {
  [key: string]: string | undefined;
} = {
  avro: 'avro.svg',
  aws_s3: 'aws-s3.svg',
  aws_sqs: 'aws-sqs.svg',
  aws_dynamodb: 'aws-dynamodb.svg',
  aws_kinesis: 'aws-kinesis.svg',
  aws_kinesis_firehose: 'aws-kinesis.svg',
  aws_sns: 'aws-sns.svg',
  aws_lambda: 'aws-lambda.svg',
  aws_dynamodb_partiql: 'aws-dynamodb.svg',
  amqp_0_9: 'rabbitmq.svg',
  amqp_1: 'network.svg',
  azure_blob_storage: 'azure.svg',
  azure_queue_storage: 'azure.svg',
  azure_table_storage: 'azure.svg',
  bloblang: 'bloblang.svg',
  beanstalkd: 'network.svg',
  cassandra: 'cassandra.svg',
  couchbase: 'couchbase.svg',
  csv: 'file.svg',
  discord: 'discord.svg',
  elasticsearch: 'elasticsearch.svg',
  file: 'file.svg',
  gcp_cloud_storage: 'google-cloud.svg',
  gcp_pubsub: 'google-cloud.svg',
  gcp_bigquery_select: 'google-cloud.svg',
  gcp_bigquery: 'google-cloud.svg',
  generate: 'bloblang.svg',
  http: 'network.svg',
  http_client: 'network.svg',
  http_server: 'network.svg',
  hdfs: 'hadoop.svg',
  kafka: 'kafka.svg',
  kafka_franz: 'kafka.svg',
  mapping: 'bloblang.svg',
  memcached: 'memcached.svg',
  mutation: 'bloblang.svg',
  mongodb: 'mongodb.svg',
  mqtt: 'mqtt.svg',
  nats: 'nats.svg',
  nats_stream: 'nats.svg',
  nats_jetstream: 'nats.svg',
  nats_kv: 'nats.svg',
  nanomsg: 'network.svg',
  nsq: 'network.svg',
  pulsar: 'pulsar.svg',
  parquet: 'parquet.svg',
  parquet_encode: 'parquet.svg',
  parquet_decode: 'parquet.svg',
  pusher: 'pusher.svg',
  redis: 'redis.svg',
  redis_list: 'redis.svg',
  redis_pubsub: 'redis.svg',
  redis_streams: 'redis.svg',
  redis_hash: 'redis.svg',
  redis_script: 'redis.svg',
  sftp: 'network.svg',
  socket: 'network.svg',
  socket_server: 'network.svg',
  sql: 'db.svg',
  sql_select: 'db.svg',
  sql_insert: 'db.svg',
  sql_raw: 'db.svg',
  snowflake_put: 'snowflake.svg',
  twitter_search: 'twitter.svg',
  websocket: 'network.svg',

  // Fallback
  utility: 'utility.svg',
};

interface LogoParams {
  type: string
}

export default function Logo({ type }: LogoParams) {
  const logoName = kindTypeLogos[type];
  if (logoName === undefined) {
    return 'utility.svg';
  }
  return logoName;
}
