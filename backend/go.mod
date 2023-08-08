module github.com/redpanda-data/console/backend

go 1.20

require (
	github.com/basgys/goxml2json v1.1.0
	github.com/bmizerany/assert v0.0.0-20160611221934-b7ed37b82869
	github.com/cloudhut/common v0.9.0
	github.com/cloudhut/connect-client v0.0.0-20230417124247-963e5bcdfee7
	github.com/dop251/goja v0.0.0-20230427124612-428fc442ff5f
	github.com/go-chi/chi/v5 v5.0.8
	github.com/go-chi/cors v1.2.1
	github.com/go-git/go-billy/v5 v5.4.1
	github.com/go-git/go-git/v5 v5.6.1
	github.com/go-resty/resty/v2 v2.7.0
	github.com/golang/mock v1.6.0
	github.com/golang/protobuf v1.5.3
	github.com/google/uuid v1.3.0
	github.com/gorilla/schema v1.2.0
	github.com/gorilla/websocket v1.5.0
	github.com/hamba/avro/v2 v2.14.0
	github.com/jarcoal/httpmock v1.0.8
	github.com/jcmturner/gokrb5/v8 v8.4.4
	github.com/jhump/protoreflect v1.14.1
	github.com/knadh/koanf v1.5.0
	github.com/mitchellh/mapstructure v1.5.0
	github.com/prometheus/client_golang v1.15.1
	github.com/redpanda-data/redpanda/src/go/rpk v0.0.0-20230519052114-f355828dd427
	github.com/stretchr/testify v1.8.3
	github.com/testcontainers/testcontainers-go/modules/redpanda v0.20.1
	github.com/twmb/franz-go v1.13.4
	github.com/twmb/franz-go/pkg/kadm v1.8.2-0.20230503140309-bf5970577daf
	github.com/twmb/franz-go/pkg/kfake v0.0.0-20230508025141-88d5c46db15b
	github.com/twmb/franz-go/pkg/kmsg v1.5.0
	github.com/twmb/franz-go/pkg/sasl/kerberos v1.1.0
	github.com/twmb/go-cache v1.0.0
	github.com/vmihailenco/msgpack/v5 v5.3.5
	github.com/zencoder/go-smile v0.0.0-20220221105746-06ef4fe5fa0a
	go.uber.org/zap v1.24.0
	golang.org/x/exp v0.0.0-20230515195305-f3d0a9c9a5cc
	golang.org/x/sync v0.2.0
	golang.org/x/text v0.9.0
	google.golang.org/protobuf v1.30.0
)

require (
	github.com/Azure/go-ansiterm v0.0.0-20230124172434-306776ec8161 // indirect
	github.com/Microsoft/go-winio v0.6.1 // indirect
	github.com/ProtonMail/go-crypto v0.0.0-20230518184743-7afd39499903 // indirect
	github.com/acomagu/bufpipe v1.0.4 // indirect
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/bitly/go-simplejson v0.5.0 // indirect
	github.com/cenkalti/backoff/v4 v4.2.1 // indirect
	github.com/cespare/xxhash/v2 v2.2.0 // indirect
	github.com/cloudflare/circl v1.3.3 // indirect
	github.com/containerd/containerd v1.7.1 // indirect
	github.com/cpuguy83/dockercfg v0.3.1 // indirect
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/dlclark/regexp2 v1.10.0 // indirect
	github.com/docker/distribution v2.8.2+incompatible // indirect
	github.com/docker/docker v23.0.6+incompatible // indirect
	github.com/docker/go-connections v0.4.0 // indirect
	github.com/docker/go-units v0.5.0 // indirect
	github.com/emirpasic/gods v1.18.1 // indirect
	github.com/fsnotify/fsnotify v1.6.0 // indirect
	github.com/go-git/gcfg v1.5.0 // indirect
	github.com/go-sourcemap/sourcemap v2.1.3+incompatible // indirect
	github.com/gogo/protobuf v1.3.2 // indirect
	github.com/google/pprof v0.0.0-20230510103437-eeec1cb781c3 // indirect
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	github.com/hashicorp/go-uuid v1.0.3 // indirect
	github.com/imdario/mergo v0.3.15 // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/jbenet/go-context v0.0.0-20150711004518-d14ea06fba99 // indirect
	github.com/jcmturner/aescts/v2 v2.0.0 // indirect
	github.com/jcmturner/dnsutils/v2 v2.0.0 // indirect
	github.com/jcmturner/gofork v1.7.6 // indirect
	github.com/jcmturner/rpc/v2 v2.0.3 // indirect
	github.com/json-iterator/go v1.1.12 // indirect
	github.com/kevinburke/ssh_config v1.2.0 // indirect
	github.com/klauspost/compress v1.16.5 // indirect
	github.com/kr/pretty v0.3.1 // indirect
	github.com/kr/text v0.2.0 // indirect
	github.com/magiconair/properties v1.8.7 // indirect
	github.com/matttproud/golang_protobuf_extensions v1.0.4 // indirect
	github.com/mitchellh/copystructure v1.2.0 // indirect
	github.com/mitchellh/reflectwalk v1.0.2 // indirect
	github.com/moby/patternmatcher v0.5.0 // indirect
	github.com/moby/sys/sequential v0.5.0 // indirect
	github.com/moby/term v0.5.0 // indirect
	github.com/modern-go/concurrent v0.0.0-20180306012644-bacd9c7ef1dd // indirect
	github.com/modern-go/reflect2 v1.0.2 // indirect
	github.com/morikuni/aec v1.0.0 // indirect
	github.com/opencontainers/go-digest v1.0.0 // indirect
	github.com/opencontainers/image-spec v1.1.0-rc3 // indirect
	github.com/opencontainers/runc v1.1.7 // indirect
	github.com/pierrec/lz4/v4 v4.1.17 // indirect
	github.com/pjbgf/sha1cd v0.3.0 // indirect
	github.com/pkg/errors v0.9.1 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/prometheus/client_model v0.4.0 // indirect
	github.com/prometheus/common v0.43.0 // indirect
	github.com/prometheus/procfs v0.9.0 // indirect
	github.com/rogpeppe/go-internal v1.10.0 // indirect
	github.com/sergi/go-diff v1.3.1 // indirect
	github.com/sethgrid/pester v1.2.0 // indirect
	github.com/sirupsen/logrus v1.9.0 // indirect
	github.com/skeema/knownhosts v1.1.1 // indirect
	github.com/spf13/afero v1.9.5 // indirect
	github.com/spf13/cobra v1.7.0 // indirect
	github.com/spf13/pflag v1.0.5 // indirect
	github.com/testcontainers/testcontainers-go v0.20.1 // indirect
	github.com/twmb/tlscfg v1.2.1 // indirect
	github.com/vmihailenco/tagparser/v2 v2.0.0 // indirect
	github.com/xanzy/ssh-agent v0.3.3 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/crypto v0.9.0 // indirect
	golang.org/x/mod v0.10.0 // indirect
	golang.org/x/net v0.10.0 // indirect
	golang.org/x/sys v0.8.0 // indirect
	golang.org/x/term v0.8.0 // indirect
	golang.org/x/tools v0.9.1 // indirect
	google.golang.org/genproto v0.0.0-20230410155749-daa745c078e1 // indirect
	google.golang.org/grpc v1.55.0 // indirect
	gopkg.in/warnings.v0 v0.1.2 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
