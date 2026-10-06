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
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	con "github.com/cloudhut/connect-client"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGateTransport_CapturesStartingError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"version":"3.9.0"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Connect-Gate", "starting")
		w.Header().Set("Retry-After", "45")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error_code":503,"reason":"kafka_connect_starting","phase":"pulling-image",` +
			`"retry_after_seconds":45,"estimated_wait_seconds":180,"message":"Kafka Connect is starting (pulling the Kafka Connect image). Retry in about 3m0s."}`))
	}))
	defer srv.Close()

	client := con.NewClient(con.WithHost(srv.URL))
	hc := client.GetClient()
	hc.Transport = newGateTransport(hc.Transport)

	// Reads are untouched.
	_, err := client.GetRoot(context.Background())
	require.NoError(t, err)

	ctx, capture := withStartingCapture(context.Background())
	err = client.PauseConnector(ctx, "mm2")
	require.Error(t, err)
	// The client still sees the plain API error.
	assert.Equal(t, http.StatusServiceUnavailable, GetStatusCodeFromAPIError(err, 0))
	// And the capture carries the details the client drops.
	require.NotNil(t, capture.err)
	assert.Equal(t, "pulling-image", capture.err.Phase)
	assert.Equal(t, 45*time.Second, capture.err.RetryAfter)
	assert.Equal(t, 180*time.Second, capture.err.EstimatedWait)
	assert.Contains(t, capture.err.Message, "pulling the Kafka Connect image")

	restErr := startingRestError(capture.err, "pause connector")
	assert.Equal(t, http.StatusServiceUnavailable, restErr.Status)
	se, ok := AsStartingError(restErr)
	require.True(t, ok)
	assert.Equal(t, 45, se.RetryAfterSeconds())
}

func TestGateTransport_IgnoresOrdinary503(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error_code":503,"message":"Request cannot be completed because a rebalance is expected"}`))
	}))
	defer srv.Close()

	client := con.NewClient(con.WithHost(srv.URL))
	hc := client.GetClient()
	hc.Transport = newGateTransport(hc.Transport)

	ctx, capture := withStartingCapture(context.Background())
	err := client.PauseConnector(ctx, "mm2")
	require.Error(t, err)
	assert.Nil(t, capture.err, "a worker's own 503 is not a starting error")
	_, ok := AsStartingError(startingRestError(&StartingError{}, "x"))
	assert.True(t, ok)
}

func TestParseStarting_Fallbacks(t *testing.T) {
	h := http.Header{}
	h.Set("Retry-After", "20")
	se := parseStarting(h, []byte(`{"message":"m"}`))
	assert.Equal(t, 20*time.Second, se.RetryAfter)
	assert.Equal(t, "m", se.Message)

	se = parseStarting(http.Header{}, []byte(`not json`))
	assert.Equal(t, 30*time.Second, se.RetryAfter)
	assert.NotEmpty(t, se.Message)
}
