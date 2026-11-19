# Copied source notices

Keep this directory with the copied Redpanda UI source. Every installable registry item depends on these notice assets, including standalone hooks and libraries. Some source-copy CLIs remove leading comments; the separate data files retain the complete license texts and attribution without changing those tools or executable source.

These notices describe included source, not every transitive package. Package dependencies retain their own licenses. Including a notice does not mean every component uses every listed upstream project.

## Redpanda UI Registry

Copyright (c) 2025 Redpanda Data, Inc.

Copyright 2026 Redpanda Data, Inc.

`REDPANDA-LICENSE.txt` is an unchanged copy of the repository-root `LICENSE.md` (MIT).

- Project: <https://github.com/redpanda-data/ui-registry>
- Original MIT terms: repository revision `6135576fcee8b841837a4de7f074f6ff16b3d8ee`. This release adds a Markdown heading and final newline in the root license without changing those terms; the copied text and digest below refer to that current root file, not the historical blob.
- SHA-256: `821cfa8d1aad2b1b265e9edcfdb77c0b2a94c53f00efca3187f31e2745866ced`

## shadcn source utilities

Copyright (c) 2023 shadcn

`SHADCN-LICENSE.txt` is an unchanged copy of `shadcn@4.22.1/LICENSE.md` (MIT). It covers included shadcn-derived source, including the scrollbar, scroll-fade and shimmer utilities distributed in `style/chat-utilities.css`.

- Project: <https://github.com/shadcn-ui/ui>
- Release: `shadcn@4.22.1`
- Immutable source: <https://github.com/shadcn-ui/ui/blob/daaf156ee00ed91cc7e6bdd937c1b4973152d141/LICENSE.md>
- SHA-256: `1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f`
- Reproduce: copy `node_modules/shadcn/LICENSE.md` from the lockfile-installed release. Its bytes match the upstream release text.

## Buf Protovalidate generated source

Copyright 2023-2026 Buf Technologies, Inc.

`BUF-APACHE-2.0.txt` is the unchanged upstream `LICENSE` (Apache License, Version 2.0), including its Buf copyright appendix. It accompanies `lib/protobuf-provider/gen/buf/validate/validate_pb.ts`, generated from the pinned `buf/validate/validate.proto`. That generated file retains its upstream header in the registry payload; these assets also retain the license and attribution when a copying tool removes leading comments.

- Project: <https://github.com/bufbuild/protovalidate>
- Module: `buf.build/bufbuild/protovalidate`
- Immutable Buf Schema Registry commit: `50325440f8f24053b047484a6bf60b76` (from `packages/registry/buf.lock`; this is a BSR commit, not a Git commit).
- Module digest: `b5:74cb6f5c0853c3c10aafc701614194bbd63326bdb8ef4068214454b8894b03ba4113e04b3a33a8321cdf05336e37db4dc14a5e2495db8462566914f36086ba31`
- License SHA-256: `ab870089234b247d1f41828bf8f39a7dbb7171277f81a56e69b474dc2fe51098`
- Source proto SHA-256: `817951eab518442950f1982be24b2c3154b214b40e42f49b915cbf5181e6ee80`
- Reproduce: `buf export buf.build/bufbuild/protovalidate:50325440f8f24053b047484a6bf60b76 --all --output <empty-directory>`, then copy that directory's `LICENSE` unchanged.
- License version reference: <https://www.apache.org/licenses/LICENSE-2.0.txt>. The pinned upstream appendix supplies the actual Buf copyright rather than generic placeholder fields.

The license texts retain their original bytes, filenames aside. `NOTICE.md` is repository-authored distribution metadata; it does not modify any license or replace the upstream license terms. Non-license leading JSDoc removal remains a limitation of the external source-copy CLI, not a promise that every source comment survives installation.
