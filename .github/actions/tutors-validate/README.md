# Tutors validate action

Checks a Tutors course folder with `tutors validate` (from `jsr:@tutors/tutors-create`) on every push and pull request. Each finding is shown in the job log and, through SARIF and GitHub code scanning, on the pull request's Files tab. The job fails when the course has errors, or warnings too with `strict: true`.

```yaml
# .github/workflows/validate.yml in a course repository
name: Validate course
on: [push, pull_request]
permissions:
  contents: read
  security-events: write # only for upload-sarif
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: tutors-sdk/tutors-mono-repo/.github/actions/tutors-validate@main
        with:
          path: .
          strict: false
```

| Input          | Default | Meaning                                                                                                               |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `path`         | `.`     | The course folder                                                                                                     |
| `strict`       | `false` | Fail on warnings too                                                                                                  |
| `upload-sarif` | `true`  | Upload findings to code scanning (needs `security-events: write`; private repositories need GitHub Advanced Security) |
| `version`      | `5`     | The `@tutors/tutors-create` version range to run                                                                      |

The output `exit-code` is `tutors validate`'s status: 0 clean, 1 errors, 2 warnings under strict, 3 the folder could not be read.

The action needs a published `@tutors/tutors-create` that includes `validate`. It lives in the mono-repo until it gets a repository of its own (`tutors-sdk/tutors-validate-action` in the plan). Its behaviour is specified by Rule 0723 in `tests/bdd/features/instructor/course-validate-action.feature`.
