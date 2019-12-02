package owl

// Q: What's the owl package's responsibility?
//
// A: The Owl package is in charge of constructing the responses for our REST API.
// It's common that a single invocation requires multiple upstream requests against Kafka
// so that we can merge the data and provide the most valuable information for the users.
// While the kafka package is the abstraction for communicating with Kafka, this package
// proccesses incoming requests from the REST API by:
//   1. Sending upstream requests (concurrently) against Kafka
//   2. Merge the responses as needed
//   3. Convert the data so that it is handy to use in the frontend
