package proto

type Config struct {
	// TempDirectoryPath specifies the path where proto descriptors can be compiled/written to. It serves as tmp directory.
	TempDirectoryPath string `yaml:"tempDirectoryPath"`
}

func (c *Config) SetDefaults() {
	c.TempDirectoryPath = "/tmp"
}

func (c *Config) Validate() error {
	// TODO: Check if tmp directory exists and is writable
	return nil
}
