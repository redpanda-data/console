package serde

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/redpanda-data/console/backend/pkg/rest"
)

var _ Serde = (*RestSerde)(nil)

// RestSerde represents the serde for dealing with REST types.
type RestSerde struct {
	RestService *rest.Service
}

// Name returns the name of the serde payload encoding.
func (RestSerde) Name() PayloadEncoding {
	return PayloadEncodingREST
}

// DeserializePayload deserializes the kafka record to our internal record payload representation.
func (d RestSerde) DeserializePayload(ctx context.Context, record *kgo.Record, payloadType PayloadType) (*RecordPayload, error) {
	if d.RestService == nil {
		return &RecordPayload{}, fmt.Errorf("no rest service configured")
	}

	restTopic := d.RestService.GetRestTopic(record.Topic)

	if restTopic == nil {
		return &RecordPayload{}, fmt.Errorf("REST encoding not configured for topic: %s", record.Topic)
	}

	payload := payloadFromRecord(record, payloadType)

	req, err := http.NewRequestWithContext(ctx, "POST", restTopic.Url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/octet-stream")

	// Pass payload type as a header to give the REST service control over different deserialization logic for key and value
	if payloadType == PayloadTypeKey {
		req.Header.Set("Payload-Type", "key")
	} else {
		req.Header.Set("Payload-Type", "value")
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("error making REST request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("REST request failed with status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading REST response body: %w", err)
	}

	var obj any
	if err := json.Unmarshal(body, &obj); err != nil {
		return nil, fmt.Errorf("failed to parse JSON response: %w", err)
	}

	return &RecordPayload{
		NormalizedPayload:   body,
		DeserializedPayload: obj,
		Encoding:            PayloadEncodingREST,
	}, nil
}

// SerializeObject serializes data into binary format ready for writing to Kafka as a record.
func (s RestSerde) SerializeObject(ctx context.Context, obj any, _ PayloadType, opts ...SerdeOpt) ([]byte, error) {
	return nil, fmt.Errorf("serializing using REST encoding is not supported")
}
