// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/cloudhut/common/rest"
)

// Kafka Connect may sit behind a gate that scales the workers to zero when
// idle. While the workers boot, the gate answers mutating calls with a 503
// whose body and headers describe the boot phase and when to retry. The
// connect client keeps only the error code and message of an error body, so
// the details are captured here from the raw response instead.
const (
	// gateHeader is set by the gate on every response it answers itself.
	gateHeader = "X-Connect-Gate"
	// gateStarting is the header value while the workers are down.
	gateStarting = "starting"
	// StartingReason identifies the condition to API clients.
	StartingReason = "kafka_connect_starting"
)

// StartingError is returned while the Kafka Connect workers are scaled to zero
// and starting up. It is retryable.
type StartingError struct {
	// Phase is the gate's view of the boot sequence, e.g. "pulling-image".
	Phase string
	// RetryAfter is how long clients should wait before retrying.
	RetryAfter time.Duration
	// EstimatedWait is the gate's rough estimate until the workers answer.
	EstimatedWait time.Duration
	// Message is the gate's human readable explanation.
	Message string
}

func (e *StartingError) Error() string {
	return e.Message
}

// RetryAfterSeconds returns the retry hint rounded to whole seconds, at least 1.
func (e *StartingError) RetryAfterSeconds() int {
	s := int(e.RetryAfter.Round(time.Second).Seconds())
	if s < 1 {
		return 1
	}
	return s
}

// gateBody is the gate's 503 body.
type gateBody struct {
	Message              string `json:"message"`
	Phase                string `json:"phase"`
	Reason               string `json:"reason"`
	RetryAfterSeconds    int    `json:"retry_after_seconds"`
	EstimatedWaitSeconds int    `json:"estimated_wait_seconds"`
}

type startingCaptureKey struct{}

// startingCapture receives the StartingError seen by the transport for the
// request carrying it in its context.
type startingCapture struct {
	err *StartingError
}

// withStartingCapture returns a context the gate transport reports into, and
// the capture to read afterwards.
func withStartingCapture(ctx context.Context) (context.Context, *startingCapture) {
	c := &startingCapture{}
	return context.WithValue(ctx, startingCaptureKey{}, c), c
}

// gateTransport inspects responses for the gate's starting marker and reports
// the parsed details into the request's capture, leaving the response intact
// for the connect client.
type gateTransport struct {
	next http.RoundTripper
}

// newGateTransport wraps next; a nil next means http.DefaultTransport.
func newGateTransport(next http.RoundTripper) http.RoundTripper {
	if next == nil {
		next = http.DefaultTransport
	}
	return &gateTransport{next: next}
}

func (t *gateTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.next.RoundTrip(req)
	if err != nil || resp == nil {
		return resp, err
	}
	if resp.StatusCode != http.StatusServiceUnavailable || resp.Header.Get(gateHeader) != gateStarting {
		return resp, nil
	}
	capture, ok := req.Context().Value(startingCaptureKey{}).(*startingCapture)
	if !ok || capture == nil {
		return resp, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	_ = resp.Body.Close()
	if readErr != nil {
		return resp, readErr
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	capture.err = parseStarting(resp.Header, body)
	return resp, nil
}

func parseStarting(h http.Header, body []byte) *StartingError {
	var b gateBody
	_ = json.Unmarshal(body, &b)
	se := &StartingError{
		Phase:         b.Phase,
		Message:       b.Message,
		RetryAfter:    time.Duration(b.RetryAfterSeconds) * time.Second,
		EstimatedWait: time.Duration(b.EstimatedWaitSeconds) * time.Second,
	}
	if se.RetryAfter == 0 {
		if secs, err := strconv.Atoi(h.Get("Retry-After")); err == nil && secs > 0 {
			se.RetryAfter = time.Duration(secs) * time.Second
		}
	}
	if se.RetryAfter == 0 {
		se.RetryAfter = 30 * time.Second
	}
	if se.Message == "" {
		se.Message = "Kafka Connect is starting. Retry shortly."
	}
	return se
}

// startingRestError builds the *rest.Error for a captured StartingError. The
// error chain carries the StartingError so the HTTP and Connect-RPC layers can
// add retry hints.
func startingRestError(se *StartingError, action string, logs ...slog.Attr) *rest.Error {
	return &rest.Error{
		Err:          fmt.Errorf("failed to %s: %w", action, se),
		Status:       http.StatusServiceUnavailable,
		Message:      se.Message,
		InternalLogs: logs,
		IsSilent:     true,
	}
}

// AsStartingError extracts a StartingError from a *rest.Error, if it carries one.
func AsStartingError(restErr *rest.Error) (*StartingError, bool) {
	if restErr == nil || restErr.Err == nil {
		return nil, false
	}
	var se *StartingError
	if errors.As(restErr.Err, &se) {
		return se, true
	}
	return nil, false
}
