package connect

import (
	"testing"

	"github.com/bmizerany/assert"
)

func Test_errorContentFromTrace(t *testing.T) {
	// tests
	type test struct {
		name         string
		initialValue string
		trace        string
		expected     string
	}

	tests := []test{
		{
			name:         "empty trace",
			initialValue: "connector 0 error",
			trace:        "",
			expected:     "connector 0 error",
		},
		{
			name:         "caused by",
			initialValue: "connector 0 error",
			trace: `org.apache.kafka.common.KafkaException: The constructor of org.apache.kafka.clients.admin.ForwardingAdmin threw an exception
			at org.apache.kafka.common.utils.Utils.newParameterizedInstance(Utils.java:469)
			at org.apache.kafka.connect.mirror.MirrorConnectorConfig.forwardingAdmin(MirrorConnectorConfig.java:211)
			at org.apache.kafka.connect.mirror.MirrorHeartbeatConnector.start(MirrorHeartbeatConnector.java:51)
			at org.apache.kafka.connect.runtime.WorkerConnector.doStart(WorkerConnector.java:190)
			at org.apache.kafka.connect.runtime.WorkerConnector.start(WorkerConnector.java:215)
			at org.apache.kafka.connect.runtime.WorkerConnector.doTransitionTo(WorkerConnector.java:360)
			at org.apache.kafka.connect.runtime.WorkerConnector.doTransitionTo(WorkerConnector.java:343)
			at org.apache.kafka.connect.runtime.WorkerConnector.doRun(WorkerConnector.java:143)
			at org.apache.kafka.connect.runtime.WorkerConnector.run(WorkerConnector.java:121)
			at org.apache.kafka.connect.runtime.isolation.Plugins.lambda$withClassLoader$1(Plugins.java:177)
			at java.base/java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:539)
			at java.base/java.util.concurrent.FutureTask.run(FutureTask.java:264)
			at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1136)
			at java.base/java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:635)
			at java.base/java.lang.Thread.run(Thread.java:833)
		Caused by: org.apache.kafka.common.config.ConfigException: Missing required configuration "bootstrap.servers" which has no default value.
			at org.apache.kafka.common.config.ConfigDef.parseValue(ConfigDef.java:493)
			at org.apache.kafka.common.config.ConfigDef.parse(ConfigDef.java:483)
			at org.apache.kafka.common.config.AbstractConfig.<init>(AbstractConfig.java:113)
			at org.apache.kafka.common.config.AbstractConfig.<init>(AbstractConfig.java:146)
			at org.apache.kafka.clients.admin.AdminClientConfig.<init>(AdminClientConfig.java:244)
			at org.apache.kafka.clients.admin.Admin.create(Admin.java:144)
			at org.apache.kafka.clients.admin.ForwardingAdmin.<init>(ForwardingAdmin.java:51)
			at java.base/jdk.internal.reflect.NativeConstructorAccessorImpl.newInstance0(Native Method)
			at java.base/jdk.internal.reflect.NativeConstructorAccessorImpl.newInstance(NativeConstructorAccessorImpl.java:77)
			at java.base/jdk.internal.reflect.DelegatingConstructorAccessorImpl.newInstance(DelegatingConstructorAccessorImpl.java:45)
			at java.base/java.lang.reflect.Constructor.newInstanceWithCaller(Constructor.java:499)
			at java.base/java.lang.reflect.Constructor.newInstance(Constructor.java:480)
			at org.apache.kafka.common.utils.Utils.newParameterizedInstance(Utils.java:458)
			... 14 more`,
			expected: `Missing required configuration "bootstrap.servers" which has no default value.`,
		},
		{
			name:         "first line",
			initialValue: "connector 0 error",
			trace: `org.apache.kafka.common.config.ConfigException: Cannot connect to 'c' S3 bucket due to: The specified bucket is not valid.
			at com.redpanda.kafka.connect.s3.config.AwsConfigValidator.validate(AwsConfigValidator.java:57)
			at com.redpanda.kafka.connect.s3.S3SinkConnector.start(S3SinkConnector.java:71)
			at org.apache.kafka.connect.runtime.WorkerConnector.doStart(WorkerConnector.java:190)
			at org.apache.kafka.connect.runtime.WorkerConnector.start(WorkerConnector.java:215)
			at org.apache.kafka.connect.runtime.WorkerConnector.doTransitionTo(WorkerConnector.java:360)
			at org.apache.kafka.connect.runtime.WorkerConnector.doTransitionTo(WorkerConnector.java:343)
			at org.apache.kafka.connect.runtime.WorkerConnector.doRun(WorkerConnector.java:143)
			at org.apache.kafka.connect.runtime.WorkerConnector.run(WorkerConnector.java:121)
			at org.apache.kafka.connect.runtime.isolation.Plugins.lambda$withClassLoader$1(Plugins.java:177)
			at java.base/java.util.concurrent.Executors$RunnableAdapter.call(Executors.java:539)
			at java.base/java.util.concurrent.FutureTask.run(FutureTask.java:264)
			at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1136)
			at java.base/java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:635)
			at java.base/java.lang.Thread.run(Thread.java:833)`,
			expected: `Cannot connect to 'c' S3 bucket due to: The specified bucket is not valid.`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := errorContentFromTrace(tc.initialValue, tc.trace)
			assert.Equal(t, tc.expected, actual)
		})
	}
}
