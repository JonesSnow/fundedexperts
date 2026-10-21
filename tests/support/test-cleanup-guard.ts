import { assertTestDatabaseCleanupAuthorized } from "./test-db-guard";

// The confirmation cannot be loaded from .env.local or .env.test.local; it must
// be explicitly supplied by the process invoking a destructive test suite.
assertTestDatabaseCleanupAuthorized(process.env);
