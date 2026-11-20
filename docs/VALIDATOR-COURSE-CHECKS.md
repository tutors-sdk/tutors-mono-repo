# Validator real-course checks — 10 November 2026

All 12 supplied repositories were checked as source ZIPs in the browser worker. All 12 published course URLs were also fetched and checked in the browser. Course findings are results, rather than failed test executions. No course was modified.

| Course repository | ZIP size | Published data | Source ZIP |
| --- | ---: | --- | --- |
| [tutors-sdk/tutors-reference-manual](https://github.com/tutors-sdk/tutors-reference-manual/tree/255937b194be5ed6dbabed15bfdf1bf61ef36bf9) | 212.1 MB | Passed | 3 warnings |
| [tutors-sdk/tutors-reference-course](https://github.com/tutors-sdk/tutors-reference-course/tree/16187b2bb8f5f51c71a31412ad6e82510c409d49) | 30.4 MB | Passed | 2 errors, 4 warnings |
| [tutors-sdk/tutors-starter](https://github.com/tutors-sdk/tutors-starter/tree/98f73b830dfcf0edae88ec748c359a506bc4ddfb) | 6.7 MB | 2 errors, 1 warning | 3 errors, 1 warning |
| [tutors-sdk/layout-reference-course](https://github.com/tutors-sdk/layout-reference-course/tree/00dad9146a92bc0a6f624802dc52df768348e049) | 8.7 MB | Passed | 3 warnings |
| [edeleastar/portfolio](https://github.com/edeleastar/portfolio/tree/c07add21b0d4636ff39134f6e22f8ef86b0fa7b3) | 0.1 MB | 1 warning | 1 warning, 1 note |
| [edeleastar/full-stack-oth-25](https://github.com/edeleastar/full-stack-oth-25/tree/f9488fe117b7916d8cd9338484b054277bd0f187) | 973.4 MB | 1 warning | 2 errors, 27 warnings |
| [edeleastar/module-web-dev-1-2022](https://github.com/edeleastar/module-web-dev-1-2022/tree/c92ce1dba52844c1cbef5780755b1f1170e83ac3) | 651.5 MB | 1 warning | 3 errors, 51 warnings |
| [edeleastar/module-web-dev-2-2022](https://github.com/edeleastar/module-web-dev-2-2022/tree/dfa26b8cc5dbe4904f77411f3df881fdba1f722d) | 235.5 MB | 1 warning | 1 error, 31 warnings |
| [edeleastar/module-mobile-app-dev-oth](https://github.com/edeleastar/module-mobile-app-dev-oth/tree/6950eb7b20b9d382e372599caff1fbbb2a2b8c2a) | 432.6 MB | 1 warning | 1 error, 34 warnings |
| [edeleastar/module-design-patterns-2017](https://github.com/edeleastar/module-design-patterns-2017/tree/69e973aae892208413662502ff50be93af0211f4) | 301.8 MB | 1 warning | 2 errors, 8 warnings |
| [edeleastar/module-agile-soft-dev-2013](https://github.com/edeleastar/module-agile-soft-dev-2013/tree/0a68842326ddff4bd3b3f90a6d81a480aa42bc04) | 354.7 MB | 1 warning | 4 errors, 17 warnings |
| [edeleastar/module-design-patterns-arch](https://github.com/edeleastar/module-design-patterns-arch/tree/7fc9c9f336c4d6c77558144ee415c0e11ac4c316) | 192.5 MB | 1 warning | 1 error, 12 warnings |

## What the samples uncovered

- The starter contains two invalid student records. Both published and source validation identify `students[0]` and `students[1]`, with the required `name` and `id` shape.
- Older published courses omit the generated `authLevel` field. The app reports one format warning while continuing schema, enrollment and quiz checks; it does not flood the report with cascading schema errors or change access settings.
- Root-relative `/course/...` links in the manual and portfolio are valid. V005 now accepts them; each affected `weburl` was fetched again at the pinned source revision and rechecked. The old `#topic/...` link in Web Development I remains a finding.
- The Full Stack source ZIP is about 973 MB, with about 1.2 GB of expanded files. The worker indexed every file while expanding source text only, preserving resource-size checks without inflating PDFs, videos or nested archives.
- Source findings include malformed lab step names, multiple PDFs in one talk, omitted folders, image sizes, and deployment configuration warnings. Review the detailed JSON before treating any finding as an instruction to change a course.

## Coverage and reproducibility

Published checks cover the complete JSON learning-object schema, metadata, and quiz diagnostics. They cannot inspect source files absent from published JSON. Source ZIP checks run all shared source rules, including Mermaid syntax; remote URL availability is not tested.

The source revisions are pinned in the links above. Published URLs may serve a different revision from their repository. After adding root-relative link support, the eight affected link files were rechecked separately at those exact source revisions; the remaining source findings came from the full archive runs. The last archive run was repeated after clearing downloaded test files when temporary disk space ran out.
