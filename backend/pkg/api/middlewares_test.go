// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0
package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCreateHSTSHeaderMiddleware(t *testing.T) {
	for _, enabled := range []bool{true, false} {
		t.Run(fmt.Sprintf("%t", enabled), func(t *testing.T) {
			middleware := createHSTSHeaderMiddleware(enabled)
			ts := httptest.NewServer(middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Write([]byte("ok"))
			})))

			defer ts.Close()

			resp, err := ts.Client().Get(ts.URL)
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, resp.StatusCode)

			val := resp.Header.Get("Strict-Transport-Security")
			if enabled {
				require.Equal(t, "max-age=31536000", val)
			} else {
				require.Equal(t, "", val)
			}
		})
	}
}
