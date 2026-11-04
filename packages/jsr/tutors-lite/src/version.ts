import config from "../deno.json" with { type: "json" };

/** The line tutors-lite prints after a build, naming the version in this package's own manifest. */
export const versionLine = `tutors-lite: ${config.version}`;
