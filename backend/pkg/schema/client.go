package schema

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/go-resty/resty/v2"
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

func newClient(cfg Config) (*Client, error) {
	// TODO: Add support to fallback to other registry urls if provided
	registryUrl := cfg.URLs[0] // Array length is checked in config validate()

	client := resty.New().
		SetHostURL(registryUrl).
		SetHeader("User-Agent", "Kowl").
		SetHeader("Accept", "application/vnd.schemaregistry.v1+json").
		SetError(&RestError{}).
		SetTimeout(time.Duration(cfg.Timeout) * time.Second)

	// Configure credentials
	if cfg.Username != "" {
		client = client.SetBasicAuth(cfg.Username, cfg.Password)
	}
	if cfg.BearerToken != "" {
		client = client.SetAuthToken(cfg.BearerToken)
	}

	// Configure Client Certificate transport
	if cfg.TLS.Enabled {
		caCertPool := x509.NewCertPool()
		if cfg.TLS.CaFilepath != "" {
			ca, err := ioutil.ReadFile(cfg.TLS.CaFilepath)
			if err != nil {
				return nil, err
			}
			isSuccessful := caCertPool.AppendCertsFromPEM(ca)
			if !isSuccessful {
				return nil, fmt.Errorf("failed to append ca file to cert pool, is this a valid PEM format?")
			}
		}

		// If configured load TLS cert & key - Mutual TLS
		var certificates []tls.Certificate
		if cfg.TLS.CertFilepath != "" && cfg.TLS.KeyFilepath != "" {
			cert, err := ioutil.ReadFile(cfg.TLS.CertFilepath)
			if err != nil {
				return nil, fmt.Errorf("failed to read cert file for schema registry client: %w", err)
			}

			privateKey, err := ioutil.ReadFile(cfg.TLS.KeyFilepath)
			if err != nil {
				return nil, fmt.Errorf("failed to read key file for schema registry client: %w", err)
			}

			pemBlock, _ := pem.Decode(privateKey)
			if pemBlock == nil {
				return nil, fmt.Errorf("no valid private key found")
			}

			tlsCert, err := tls.X509KeyPair(cert, privateKey)
			if err != nil {
				return nil, fmt.Errorf("failed to load certificate pair for schema registry client: %w", err)
			}
			certificates = []tls.Certificate{tlsCert}
		}

		transport := &http.Transport{TLSClientConfig: &tls.Config{
			InsecureSkipVerify: cfg.TLS.InsecureSkipTLSVerify,
			Certificates:       certificates,
			RootCAs:            caCertPool,
		}}

		client.SetTransport(transport)
	}

	return &Client{
		cfg:    cfg,
		client: client,
	}, nil
}

type SchemaResponse struct {
	Schema     string      `json:"schema"`
	SchemaType string      `json:"schemaType,omitempty"`
	References []Reference `json:"references,omitempty"`
}

type Reference struct {
	Name    string `json:"name"`
	Subject string `json:"subject"`
	Version int    `json:"version"`
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

// SchemaVersionedResponse represents the schema resource returned by the Schema Registry
type SchemaVersionedResponse struct {
	Subject    string      `json:"subject"`
	SchemaID   int         `json:"id"`
	Version    int         `json:"version"`
	Schema     string      `json:"schema"`
	Type       string      `json:"schemaType"`
	References []Reference `json:"references"`
}

// GetSchemaBySubject returns the schema for the specified version of this subject. The unescaped schema only is returned.
// subject (string) – Name of the subject
// version (versionId) – Version of the schema to be returned. Valid values for versionId are between [1,2^31-1] or
// 		the string “latest”, which returns the last registered schema under the specified subject.
//		Note that there may be a new latest schema that gets registered right after this request is served.
func (c *Client) GetSchemaBySubject(subject string, version string) (*SchemaVersionedResponse, error) {
	res, err := c.client.R().SetResult(&SchemaVersionedResponse{}).SetPathParams(map[string]string{
		"subjects": subject,
		"version":  version,
	}).Get("/subjects/{subjects}/versions/{version}")
	if err != nil {
		return nil, fmt.Errorf("get schema by subject request failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get schema by subject request failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	parsed, ok := res.Result().(*SchemaVersionedResponse)
	if !ok {
		return nil, fmt.Errorf("failed to parse schema by subject response")
	}
	if parsed.Type == "" {
		parsed.Type = "AVRO"
	}

	return parsed, nil
}

type SubjectsResponse struct {
	Subjects []string // Subject names
}

// GetSubjects returns a list of registered subjects.
func (c *Client) GetSubjects() (*SubjectsResponse, error) {
	res, err := c.client.R().SetResult([]string{}).Get("/subjects")
	if err != nil {
		return nil, fmt.Errorf("get subjects request failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get subjects request failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	result := res.Result()
	parsed, ok := result.(*[]string)
	if !ok {
		return nil, fmt.Errorf("failed to parse subjects response")
	}

	return &SubjectsResponse{
		Subjects: *parsed,
	}, nil
}

type SubjectVersionsResponse struct {
	Versions []int
}

func (c *Client) GetSubjectVersions(subject string) (*SubjectVersionsResponse, error) {
	url := fmt.Sprintf("/subjects/%s/versions", subject)
	res, err := c.client.R().SetResult([]int{}).Get(url)
	if err != nil {
		return nil, fmt.Errorf("get subject versions request failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get subject versions request failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	parsed, ok := res.Result().(*[]int)
	if !ok {
		return nil, fmt.Errorf("failed to parse subject versions response")
	}

	return &SubjectVersionsResponse{
		Versions: *parsed,
	}, nil
}

type ModeResponse struct {
	// Possible values are: IMPORT, READONLY, READWRITE
	Mode string `json:"mode"`
}

// GetMode returns the current mode for Schema Registry at a global level.
func (c *Client) GetMode() (*ModeResponse, error) {
	res, err := c.client.R().SetResult(&ModeResponse{}).Get("/mode")
	if err != nil {
		return nil, fmt.Errorf("get mode request failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get mode request failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	parsed, ok := res.Result().(*ModeResponse)
	if !ok {
		return nil, fmt.Errorf("failed to parse mode response")
	}

	return parsed, nil
}

type ConfigResponse struct {
	// Global compatibility level. Will be one of:
	// BACKWARD, BACKWARD_TRANSITIVE, FORWARD, FORWARD_TRANSITIVE, FULL, FULL_TRANSITIVE, NONE, DEFAULT (only for subject configs)
	Compatibility string `json:"compatibilityLevel"`
}

// GetConfig gets global compatibility level.
func (c *Client) GetConfig() (*ConfigResponse, error) {
	res, err := c.client.R().SetResult(&ConfigResponse{}).Get("/config")
	if err != nil {
		return nil, fmt.Errorf("get config failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get config failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	parsed, ok := res.Result().(*ConfigResponse)
	if !ok {
		return nil, fmt.Errorf("failed to parse config response")
	}

	return parsed, nil
}

// GetSubjectConfig gets compatibility level for a given subject.
// If the subject you ask about does not have a subject-specific compatibility level set, this command returns an
// error code. For example, if you run the same command for the subject Kafka-value, for which you have not set
// subject-specific compatibility, you get: {"error_code":40401,"message":"Subject 'Kafka-value' not found."}
func (c *Client) GetSubjectConfig(subject string) (*ConfigResponse, error) {
	url := fmt.Sprintf("/config/%s", subject)
	params := map[string]string{"defaultToGlobal": "true"}
	res, err := c.client.R().SetResult(&ConfigResponse{}).SetPathParams(params).Get(url)
	if err != nil {
		return nil, fmt.Errorf("get config for subject failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get config for subject failed: Status code %d", res.StatusCode())
		}

		if restErr.ErrorCode == codeSubjectNotFound {
			return &ConfigResponse{
				Compatibility: "DEFAULT",
			}, nil
		}
		return nil, restErr
	}

	parsed, ok := res.Result().(*ConfigResponse)
	if !ok {
		return nil, fmt.Errorf("failed to parse config for subject response")
	}

	return parsed, nil
}

// GetSchemaTypes returns supported types (AVRO, PROTOBUF, JSON)
func (c *Client) GetSchemaTypes() ([]string, error) {
	var supportedTypes []string
	res, err := c.client.R().SetResult(&supportedTypes).Get("/schemas/types")
	if err != nil {
		return nil, fmt.Errorf("get schema types failed: %w", err)
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get schema types failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	return supportedTypes, nil
}

func (c *Client) GetSchemas() ([]SchemaVersionedResponse, error) {
	var schemas []SchemaVersionedResponse
	res, err := c.client.R().SetResult(&schemas).Get("/schemas")
	if err != nil {
		return nil, fmt.Errorf("get schemas failed: %w", err)
	}

	if res.StatusCode() == http.StatusNotFound {
		// The /schemas endpoint has been introduced with v6.0.0, so instead we could achieve the same by querying
		// every subject one by one
		return c.GetSchemasIndividually()
	}

	if res.IsError() {
		restErr, ok := res.Error().(*RestError)
		if !ok {
			return nil, fmt.Errorf("get schemas failed: Status code %d", res.StatusCode())
		}
		return nil, restErr
	}

	return schemas, nil
}

// GetSchemasIndividually returns all schemas by describing all schemas one by one. This may be used against
// schema registry that don't support the /schemas endpoint that returns a list of all registered schemas.
func (c *Client) GetSchemasIndividually() ([]SchemaVersionedResponse, error) {
	subjectsRes, err := c.GetSubjects()
	if err != nil {
		return nil, fmt.Errorf("failed to get subjects to fetch schemas for: %w", err)
	}

	type chRes struct {
		schemaRes *SchemaVersionedResponse
		err       error
	}
	ch := make(chan chRes, len(subjectsRes.Subjects))

	// Describe all subjects concurrently one by one
	for _, subject := range subjectsRes.Subjects {
		go func(s string) {
			r, err := c.GetSchemaBySubject(s, "latest")
			ch <- chRes{
				schemaRes: r,
				err:       err,
			}
		}(subject)
	}

	schemas := make([]SchemaVersionedResponse, 0)
	for i := 0; i < cap(ch); i++ {
		res := <-ch
		if res.err != nil {
			return nil, fmt.Errorf("failed to fetch at least one schema: %w", res.err)
		}
		schemas = append(schemas, *res.schemaRes)
	}

	return schemas, nil
}

// CheckConnectivity checks whether the schema registry can be access by GETing the /subjects
func (c *Client) CheckConnectivity() error {
	url := "subjects"
	res, err := c.client.R().Get(url)
	if err != nil {
		return err
	}

	if res.IsError() {
		body := string(res.Body())
		return fmt.Errorf("response is an error. Status: %d - %s", res.StatusCode(), body)
	}

	return nil
}
