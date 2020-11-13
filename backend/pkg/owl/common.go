package owl

import "github.com/twmb/franz-go/pkg/kgo"

type BrokerRequestError struct {
	BrokerMeta kgo.BrokerMetadata `json:"brokerMetadata"`
	Error      error              `json:"error"`
}
