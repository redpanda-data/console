package main

func main() {
	build := NewAPIBuilder()
	api := build.Build()
	api.Start()
}
