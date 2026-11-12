# SARIF 2.1.0 schema

`sarif-schema-2.1.0.json` is the OASIS SARIF 2.1.0 JSON schema as published at
https://json.schemastore.org/sarif-2.1.0.json (the `$schema` that `tutors validate --format sarif` names), unchanged.
Rule 0761 (tests/bdd/features/developer/validate-ci.feature) validates every SARIF report against it, so a report
GitHub code scanning would refuse fails CI instead of the upload in a lecturer's workflow.
