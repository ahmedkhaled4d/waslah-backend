import { getSecret } from '@aws-lambda-powertools/parameters/secrets';

const FIVE_MINUTES = 300;

/** Reads a Secrets Manager string secret, cached in memory across invocations. */
export async function getSecretValue(secretId: string): Promise<string> {
  const value = await getSecret(secretId, { maxAge: FIVE_MINUTES });
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Secret ${secretId} is empty or not a string`);
  }
  return value;
}
