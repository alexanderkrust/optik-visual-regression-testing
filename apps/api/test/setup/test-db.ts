/**
 * The integration tests need a PostgreSQL database they may wipe. It is taken
 * from TEST_DATABASE_URL and must be named *_test, so the tests can never
 * truncate a real database by accident.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set, e.g. postgresql://optik:optik@localhost:5432/optik_test',
    );
  }
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to run tests against database "${name}" — its name must end with _test`);
  }
  return url;
}
