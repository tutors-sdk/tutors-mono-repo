# Course validator fixtures

One file per rule of `@tutors/course-rules`. Each holds a `broken` course that breaks only that rule and the `fixed` form of the same course, as a map from path to file contents (`%PDF` stands in for a PDF, `PNG` for an image). The course-validation feature (Rules 0695-0700) asserts the broken course reports the rule and the fixed course reports nothing, and the generator conformance test builds both with `@tutors/tutors-gen-lib`.
