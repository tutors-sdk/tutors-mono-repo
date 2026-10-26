# @tutors/logger-core

The Tutors logger: levels, child loggers, transports, request context, and JSON, pretty and CLI formats. It has no dependencies and imports nothing outside its own files (Rule
0290), so it runs in Node, Deno and the browser.

```ts
import log, { addTransport, useCliOutput } from "@tutors/logger-core";

log.warn("unable to locate file", { path });
```

The Deno packages (`tutors-gen-lib`, `tutors-model-lib`, `tutors-time-lib`, `tutors-create`) log through the default logger, so a transport an app adds, such as the reader's error
transport, receives their errors too (Rule 0291). The apps import `@tutors/logger`, which re-exports this package and adds the SvelteKit server glue.

A command-line entry point calls `useCliOutput("<tool>")` once; every entry is then printed as one short line such as `tutors warn: unable to locate file (path=topic-01/talk.md)`
(Rule 0292). Set `LOG_LEVEL` to `debug`, `info`, `warn` or `error` to change how much is printed.
