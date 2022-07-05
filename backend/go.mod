module github.com/redpanda-data/console/backend

go 1.18

require (
	github.com/basgys/goxml2json v1.1.0
	github.com/bmizerany/assert v0.0.0-20160611221934-b7ed37b82869
	github.com/cloudhut/common v0.6.0
	github.com/cloudhut/connect-client v0.0.0-20211109055846-c9f53449bdc5
	github.com/dop251/goja v0.0.0-20220516123900-4418d4575a41
	github.com/go-chi/chi v4.1.2+incompatible
	github.com/go-git/go-billy/v5 v5.3.1
	github.com/go-git/go-git/v5 v5.4.2
	github.com/go-resty/resty/v2 v2.7.0
	github.com/google/uuid v1.3.0
	github.com/gorilla/schema v1.2.0
	github.com/gorilla/websocket v1.5.0
	github.com/jarcoal/httpmock v1.0.8
	github.com/jcmturner/gokrb5/v8 v8.4.2
	github.com/jhump/protoreflect v1.12.0
	github.com/knadh/koanf v1.4.2
	github.com/linkedin/goavro/v2 v2.11.1
	github.com/mitchellh/mapstructure v1.5.0
	github.com/pkg/errors v0.9.1
	github.com/prometheus/client_golang v1.12.2
	github.com/stretchr/testify v1.7.0
	github.com/twmb/franz-go v1.6.0
	github.com/twmb/franz-go/pkg/kmsg v1.1.0
	github.com/twmb/franz-go/pkg/sasl/kerberos v1.0.0
	github.com/vmihailenco/msgpack/v5 v5.3.5
	go.uber.org/zap v1.21.0
	golang.org/x/net v0.0.0-20220617184016-355a448f1bc9
	golang.org/x/sync v0.0.0-20220601150217-0de741cfad7f
)

require (
	github.com/Azure/go-ansiterm v0.0.0-20210617225240-d185dfc1b5a1 // indirect
	github.com/Microsoft/go-winio v0.5.2 // indirect
	github.com/Microsoft/hcsshim v0.8.23 // indirect
	github.com/ProtonMail/go-crypto v0.0.0-20220517143526-88bb52951d5b // indirect
	github.com/acomagu/bufpipe v1.0.3 // indirect
	github.com/anmitsu/go-shlex v0.0.0-20200514113438-38f4b401e2be // indirect
	github.com/avast/retry-go v3.0.0+incompatible // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/bitly/go-simplejson v0.5.0 // indirect
	github.com/cenkalti/backoff/v4 v4.1.2 // indirect
	github.com/cespare/xxhash/v2 v2.1.2 // indirect
	github.com/containerd/cgroups v1.0.1 // indirect
	github.com/containerd/containerd v1.5.9 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/dlclark/regexp2 v1.4.1-0.20201116162257-a2a8dda75c91 // indirect
	github.com/docker/distribution v2.7.1+incompatible // indirect
	github.com/docker/docker v20.10.11+incompatible // indirect
	github.com/docker/go-connections v0.4.0 // indirect
	github.com/docker/go-units v0.4.0 // indirect
	github.com/emirpasic/gods v1.18.1 // indirect
	github.com/fsnotify/fsnotify v1.5.4 // indirect
	github.com/gliderlabs/ssh v0.3.2 // indirect
	github.com/go-git/gcfg v1.5.0 // indirect
	github.com/go-sourcemap/sourcemap v2.1.3+incompatible // indirect
	github.com/gogo/protobuf v1.3.2 // indirect
	github.com/golang/groupcache v0.0.0-20200121045136-8c9f03a8e57e // indirect
	github.com/golang/protobuf v1.5.2 // indirect
	github.com/golang/snappy v0.0.4 // indirect
	github.com/hashicorp/go-uuid v1.0.3 // indirect
	github.com/imdario/mergo v0.3.13 // indirect
	github.com/jbenet/go-context v0.0.0-20150711004518-d14ea06fba99 // indirect
	github.com/jcmturner/aescts/v2 v2.0.0 // indirect
	github.com/jcmturner/dnsutils/v2 v2.0.0 // indirect
	github.com/jcmturner/gofork v1.0.0 // indirect
	github.com/jcmturner/rpc/v2 v2.0.3 // indirect
	github.com/kevinburke/ssh_config v1.2.0 // indirect
	github.com/klauspost/compress v1.15.6 // indirect
	github.com/kr/pretty v0.3.0 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/magiconair/properties v1.8.5 // indirect
	github.com/matttproud/golang_protobuf_extensions v1.0.2-0.20181231171920-c182affec369 // indirect
	github.com/mitchellh/copystructure v1.2.0 // indirect
	github.com/mitchellh/go-homedir v1.1.0 // indirect
	github.com/mitchellh/reflectwalk v1.0.2 // indirect
	github.com/moby/sys/mount v0.2.0 // indirect
	github.com/moby/sys/mountinfo v0.5.0 // indirect
	github.com/moby/term v0.0.0-20210619224110-3f7ff695adc6 // indirect
	github.com/morikuni/aec v0.0.0-20170113033406-39771216ff4c // indirect
	github.com/opencontainers/go-digest v1.0.0 // indirect
	github.com/opencontainers/image-spec v1.0.2 // indirect
	github.com/opencontainers/runc v1.0.2 // indirect
	github.com/pierrec/lz4/v4 v4.1.15 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/prometheus/client_model v0.2.0 // indirect
	github.com/prometheus/common v0.35.0 // indirect
	github.com/prometheus/procfs v0.7.3 // indirect
	github.com/sergi/go-diff v1.2.0 // indirect
	github.com/sirupsen/logrus v1.8.1 // indirect
	github.com/testcontainers/testcontainers-go v0.13.0 // indirect
	github.com/twmb/franz-go/pkg/kadm v1.1.1 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/xanzy/ssh-agent v0.3.1 // indirect
	go.opencensus.io v0.22.4 // indirect
	go.uber.org/atomic v1.9.0 // indirect
	go.uber.org/multierr v1.8.0 // indirect
	golang.org/x/crypto v0.0.0-20220525230936-793ad666bf5e // indirect
	golang.org/x/mod v0.4.2 // indirect
	golang.org/x/sys v0.0.0-20220615213510-4f61da869c0c // indirect
	golang.org/x/text v0.3.7 // indirect
	google.golang.org/genproto v0.0.0-20220621134657-43db42f103f7 // indirect
	google.golang.org/grpc v1.47.0 // indirect
	google.golang.org/protobuf v1.28.0 // indirect
	gopkg.in/warnings.v0 v0.1.2 // indirect
	gopkg.in/yaml.v2 v2.4.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
	honnef.co/go/tools v0.1.1 // indirect
)
