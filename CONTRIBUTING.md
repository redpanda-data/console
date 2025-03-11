# Contributing to Redpanda Console

Welcome! This guide is intended to help developers that are new to the community
navigate the process of making contributions to Redpanda Console. Please be
sure to also checkout our [code of conduct](https://github.com/redpanda-data/redpanda/blob/dev/CODE_OF_CONDUCT.md).
We work hard to make this a welcoming community for all, and we're excited that 
you are here!

The basics:

* Use the [Issue Tracker](https://github.com/redpanda-data/console/issues) to
  report bugs, crashes, performance issues, etc... Please include as much detail
  as possible.

* We ask that developers sign our [contributor license
  agreement](https://github.com/redpanda-data/redpanda/tree/dev/licenses). The
  process of signing the CLA is automated, and you'll be prompted instructions
  the first time you submit a pull request to the project.

## Recommended Steps to contribute

1. Read this contributing guide
2. Setup local dev environment
3. If you want to work on a new feature, coordinate with the maintainers first
4. Submit changes

### Setup local dev environment

Prerequisites that should be installed before proceeding:

- Latest Node.js v22 & bun 1.2.4 or newer
- Latest Go version
- Docker (required to start a local redpanda cluster)

Redpanda Console consists of two components:

1. React single page application for the frontend
2. Go backend, which hosts the HTTP / RESTish API

After cloning the repository, we need to start them both separately as follows:

**Frontend:**
- Open a terminal tab and go to the /frontend directory
- Run `bun install` to install the required frontend dependencies
- Run `bun start` to start the React proxy that will serve the frontend

The frontend should be accessible under http://localhost:3000 now. However,
it is expected that an error is returned because the frontend has no
API to talk to yet. If the frontend is started via bun, errors will be rendered
differently and provide more options that shall help during development.

**Backend:**
- Browse to /docs/local directory
- Run `docker compose up -d` to start docker containers (skip this step if you want to use a remotely running Redpanda/Kafka clusters)
- Change directory to /backend
- Run `KAFKA_BROKERS=localhost:9092 SERVEFRONTEND=false SERVER_LISTENPORT=9090 go run cmd/api/main.go`

If you plan to develop on the backend it makes sense to start the go binary with
your IDE so that you can attach your debugger on startup as well.

## Submitting changes

We use a standard GitHub fork + pull request model for merging and reviewing
changes. New pull requests should be made against the upstream `master` branch.
After a pull request is opened it will be reviewed, and merged after
passing continuous integration tests and being accepted by a project or
sub-system maintainer.

### Review process

In addition to the content of the changes being made, reviews will consider
three additional properties:

1. Formatting of code and documentation
2. Composition of commit history
3. Content of commit messages

We care a great deal about the hygiene of the patches that are merged into the
project, and we've designed our review process and standards to reflect that.
However, we're always trying to improve, and welcome any suggestions and
feedback.

### Formatting & linting

All mainstream editors and IDEs should  provide support (either natively 
or through a plugin) for integrating with code formatting tools that can
consume the project property files. Configuring your editor to do this is 
highly recommended.

Styling rules are enforced at the granularity of the pull request, rather than on
each commit. This is important because occasionally a small change may cause a large
reformatting, which makes reviewing changes difficult. In this case it would be
appropriate to split the code change and formatting into separate commits. This is
usually unnecessary.

Before submitting your commits, please validate them against the existing linter
rules. This repository uses a task runner in order to install the required
dependencies (build tools, linters, formatters) as well as linting and formatting
code. In order to use them:

1. Install [task](https://taskfile.dev/installation/) on your machine
2. In the repository root run: `task backend:fmt`
3. If you run `task backend:lint` in the repository root the output will highlight
   linting issues.

### Tests

Whether you are fixing an issue or adding a new feature, it is recommended that new
tests are added to cover the new functionality. Tests can be run from command line.

**Frontend:**
- Open a terminal tab and go to the /frontend directory
- Run `bun test` to run all tests

**Backend:**
- Some integration tests require a running Docker instance
- In the repository root run `task backend:test-unit` to run the unit tests
- Run `task backend:test-integration` to run the unit and integration tests
- Run `task backend:cover` to run the unit and integration tests with code coverage report
- Run `task backend:verify` to run the linter and all tests

### Commit history

The ordering and structure of commits in a pull request is very important. This
is because the way in which a large change is broken down into individual
commits has a significant impact on the review process and later on the ability
to efficiently find certain types of regressions. A good rule of thumb is that
a set of changes is in good shape when the following properties hold:

1. Each commit introduces a single logical change
2. Each commit represents a tree that builds without errors

Combined, these two properties tend to produce a history with changes that are
easier to review (smaller, focused commits), and ensure that tools like `git
bisect` are able to be applied to the tree.

Here is an example of commits in a hypothetical pull request:

```
b9f49db32 credits: opening sequence
b3032f211 scene: morty and summer enter the garage
60a49a8b9 scene: dog robots build space laser
a34b3eaa0 scene: morty turns into a glass jar
187547195 credit: closing sequence
```

After receiving feedback, it may be the case that the following additional
changes are made:

```
b9f49db32 credits: opening sequence
b3032f211 scene: morty and summer enter the garage
60a49a8b9 scene: dog robots build space laser
a34b3eaa0 scene: morty turns into a glass jar
187547195 credit: closing sequence

// extra commits
20929ab22 add extra joke to garage scene
330fff211 add a new scene in living room
b0329aaa1 morty glass jar should also levitate
```

Before merging we expect that the extra commits be folded back into any previous
commits that they modify, resulting in concise commit history that doesn't
reflect the intermediate changes made based on feedback. In this example, the
following is a reasonable final set of commits:

```
cbff210db Merge pull request #123 from rick/morty
b9f49db32 credits: opening sequence
b3032f211 scene: morty and summer enter the garage
60a49a8b9 scene: dog robots build space laser
a34b3eaa0 scene: morty turns into a glass jar
330fff211 scene: summer and snuffles watching tv
187547195 credit: closing sequence
```

It is common to force push to the pull request branch with the modified history.
In this case it can be useful to use the `--keep-base` option to `git rebase`
which will ensure a minimal change set for reviewers.  However, depending on the
nature of pull request and feedback it may be useful to push extra commits and
clean up the history as a last step.

### Commit messages

In addition to code formatting and commit history discussed above, the commit
messages themselves (both the format and content being communicated) are also
important.  First let's take a look at formatting.

It may be surprising that we consider commit message formatting to be important
enough to have its own section in the contributors guide. There are a couple
reasons for this.  First, in our experience we have found that adopting a
standard for issues related to style and formatting help reduce cognitive load
when consuming content like code or technical writing. But from a practical
stand point, many developers use terminal based editors with restrictions on
line width which is the primary dimension to the formatting guidelines of commit
messages.

Here is a sample commit message and below we'll discuss formatting guidelines in
the context of this message:

```
server: display redpanda logo in log when starting

When redpanda starts it logs lots of important messages like the active
configuration and details about the system resources. However, it fails
to do anything fun. This patch resolves this shortcoming by displaying
the following redpanda ascii art logo when the system starts.
                                                                                                                      
       ___           ___                         ___         ___           ___                         ___         
      /\  \         /\__\         _____         /\  \       /\  \         /\  \         _____         /\  \        
     /::\  \       /:/ _/_       /::\  \       /::\  \     /::\  \        \:\  \       /::\  \       /::\  \       
    /:/\:\__\     /:/ /\__\     /:/\:\  \     /:/\:\__\   /:/\:\  \        \:\  \     /:/\:\  \     /:/\:\  \      
   /:/ /:/  /    /:/ /:/ _/_   /:/  \:\__\   /:/ /:/  /  /:/ /::\  \   _____\:\  \   /:/  \:\__\   /:/ /::\  \     
  /:/_/:/__/___ /:/_/:/ /\__\ /:/__/ \:|__| /:/_/:/  /  /:/_/:/\:\__\ /::::::::\__\ /:/__/ \:|__| /:/_/:/\:\__\    
  \:\/:::::/  / \:\/:/ /:/  / \:\  \ /:/  / \:\/:/  /   \:\/:/  \/__/ \:\~~\~~\/__/ \:\  \ /:/  / \:\/:/  \/__/    
   \::/~~/~~~~   \::/_/:/  /   \:\  /:/  /   \::/__/     \::/__/       \:\  \        \:\  /:/  /   \::/__/         
    \:\~~\        \:\/:/  /     \:\/:/  /     \:\  \      \:\  \        \:\  \        \:\/:/  /     \:\  \         
     \:\__\        \::/  /       \::/  /       \:\__\      \:\__\        \:\__\        \::/  /       \:\__\        
      \/__/         \/__/         \/__/         \/__/       \/__/         \/__/         \/__/         \/__/        
         

The logo is printed to standard out on start-up and when logging to a
normal log file. It is not displayed when logging to journald as the
formatting is not particularly nice.

The ascii art string literal is annotated with a compiler directive to
indicate that this string is rarely used and can be stored in a location
optimized for such data.
```

The format of the subject is `area[/detail]: short description` and the entire
line should be no more than 50 characters in length. The `prefix:` is helpful
for readers to quickly identify the relevant subsystem. We recommend taking
a look at recent Git history for examples of common `prefix:` choices.

There is no restriction on the length of the body, but lines should
wrap at 72 characters. The exception to this rule is text that should be
formatted verbatim like log messages, stack traces, and redpanda ascii art.

#### Content

While there is no algorithm for writing the perfect commit message, we've found
that working towards the following three goals is often a positive signal that
a commit message is in good shape:

1. Explain why the change is being made (the before, and after)
2. Describe important / non-obvious technical details
3. Require no extra context to understand

Good technical communication takes a lot of practice, and what makes sense to
one person isn't always optimal for another reader. So our suggestion is to
error on the side of more detail, and not stress about making it perfect. Read
on below if you are curious for more details about these bullet points.

#### Explanation and advice

When composing a commit message it is important to consider that the content
serves two distinct goals: optimizing for reviewer time and precision, and
providing a historical narrative of changes. In the short term a commit message
will be the first thing a reviewer consumes, and can have a dramatic impact on
the review process, even for small changes which might require a lot of context
to understand.

An important property of a commit message is that it is understandable when read
in the future by developers that did not participate in the original design and
review process. In complex systems like Redpanda it is not uncommon to review
historical changes to sub-systems while debugging an issue or investigating
regressions. But stumbling upon what looks like a critical change with no
explanation can make this process slow and arduous. Since the chance of any one
commit being the bottleneck in such a process are tiny, the only robust solution
is to treat each commit as being likely involved in such a process.

A good rule of thumb is one paragraph for describing why the change is being
made. This should generally stand independent of the physical change being made,
and describe the state of the system being transitioned _away from_, why that
state no longer desirable, and how the new state addresses those shortcomings.

It is much harder to decide what technical details are important or non-obvious.
But, if you happened to think one aspect of the changes were interesting or
challenging, reviewers and future debuggers will probably have the same--but
magnified--reaction.

Finally, the commit message should stand on its own. This means that it should
largely not depend on or refer to other commits in a series (e.g. "in the
previous commit..." or "and in a later commit this will be implemented"), nor
should it refer to out-of-band conversations (e.g. "in last week's meeting").
Refer to high-level context in the pull request description.
