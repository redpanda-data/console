package schema

import (
	"fmt"
	"github.com/go-resty/resty/v2"
	"time"
)

// Client that talks to the (Confluent) Schema Registry via REST
type Client struct {
	cfg    Config
	client *resty.Client
}

type RestError struct {
	ErrorCode int    `json:"error_code"`
	Message   string `json:"message"`
}

func (e RestError) Error() string {
	return fmt.Sprintf("schema registry request failed: %d - %s", e.ErrorCode, e.Message)
}

func newClient(cfg Config) *Client {
	// TODO: Add support for custom TLS certificates
	// TODO: Add support to fallback to other registry urls if provided
	registryUrl := cfg.URLs[0] // Array length is checked in config validate()

	client := resty.New().
		SetHostURL(registryUrl).
		SetHeader("User-Agent", "Kowl").
		SetHeader("Accept", "Accept: application/vnd.schemaregistry.v1+json").
		SetError(&RestError{}).
		SetTimeout(5 * time.Second)

	// Configure credentials
	if cfg.Username != "" {
		client.SetBasicAuth(cfg.Username, cfg.Password)
	}
	if cfg.BearerToken != "" {
		client.SetAuthToken(cfg.BearerToken)
	}

	return &Client{
		cfg:    cfg,
		client: client,
	}
}

type SchemaResponse struct {
	Schema string `json:"schema"`
}

// GetSchemaByID returns the schema string identified by the input ID.
// id (int) – the globally unique identifier of the schema
func (c *Client) GetSchemaByID(id uint32) (*SchemaResponse, error) {
	url := fmt.Sprintf("/schemas/ids/%d", id)
	res, err := c.client.R().SetResult(&SchemaResponse{}).Get(url)
	if err != nil {
		return nil, fmt.Errorf("get schema by id request failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get schema by id request failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	parsed, ok := res.Result().(*SchemaResponse)
	if !ok {
		return nil, fmt.Errorf("failed to parse schema response")
	}

	return parsed, nil
}

// CheckConnectivity checks whether the schema registry can be access by GETing the /subjects
func (c *Client) CheckConnectivity() error {
	url := "/subjects"
	res, err := c.client.R().Get(url)
	if err != nil {
		return err
	}

	if res.IsError() {
		return fmt.Errorf("response is an error. Status: %d", res.StatusCode())
	}

	return nil
}
