package connect

import (
	"crypto/tls"
	"time"
)

type ClientOption func(c *Client)

func WithHost(host string) ClientOption {
	return func(c *Client) {
		c.hostURL = host
	}
}

func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		c.timeout = timeout
	}
}

func WithUserAgent(userAgent string) ClientOption {
	return func(c *Client) {
		c.userAgent = userAgent
	}
}

func WithBasicAuth(username string, password string) ClientOption {
	return func(c *Client) {
		c.username = username
		c.password = password
	}
}

func WithAuthToken(token string) ClientOption {
	return func(c *Client) {
		c.authToken = token
	}
}

func WithTLSConfig(tlsCfg *tls.Config) ClientOption {
	return func(c *Client) {
		c.tlsCfg = tlsCfg
	}
}
