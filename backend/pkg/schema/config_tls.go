package schema

// TLSConfig to connect to Kafka via TLS
type TLSConfig struct {
	CaFilepath string `koanf:"caFilepath"`
}
