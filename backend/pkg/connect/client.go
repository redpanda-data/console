package connect

import (
	"crypto/tls"
	"github.com/go-resty/resty/v2"
	"time"
)

// Client that talks to the Kafka Connect instances via HTTP
type Client struct {
	client *resty.Client

	// General config
	hostURL   string
	userAgent string
	timeout   time.Duration

	// Security
	//
	// Basic auth
	username string
	password string

	// Bearer token
	authToken string

	// TLS
	tlsCfg *tls.Config
}

func NewClient(opts ...ClientOption) *Client {
	c := &Client{
		client:    nil,
		hostURL:   "",
		userAgent: "Kowl",
		timeout:   60 * time.Second,
		tlsCfg:    &tls.Config{},
	}
	for _, opt := range opts {
		opt(c)
	}

	c.client = resty.New().
		SetHostURL(c.hostURL).
		SetHeader("User-Agent", c.userAgent).
		SetHeader("Accept", "application/json").
		SetHeader("Content-Type", "application/json").
		SetTimeout(c.timeout).
		SetError(&ApiError{}).
		// SetBasicAuth(c.username, c.password).
		SetAuthToken(c.authToken).
		SetTLSClientConfig(c.tlsCfg)

	return c
}
