/**
 * The netlify.toml that `tutors create` writes, and that V011's fix writes into a course that has none.
 * A unit test holds this byte-identical to the create package's template.
 */
export const netlifyToml = `# Build & publish this Tutors course straight from Git.
# Connect the repository in Netlify; no other settings needed.

[build]
  command = "deno run -A jsr:@tutors/tutors"
  publish = "json"

# The site is read by the tutors.dev reader, which fetches tutors.json
# cross-origin - allow that, and bounce direct visits to the reader.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    Access-Control-Allow-Origin = "*"
`;
