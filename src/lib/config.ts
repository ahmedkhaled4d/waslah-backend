import { z } from 'zod';

const EnvSchema = z.object({
  STAGE: z.enum(['dev', 'prod']).default('dev'),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  WA_WABA_ID: z.string().min(1),
  WA_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'Expected a version like v23.0'),
});

export type Config = z.infer<typeof EnvSchema>;

/**
 * Secrets come from environment variables: `.env` locally, GitHub Actions secrets in CI
 * (injected into the Lambda environment by serverless.yml). Each function only receives the
 * secrets it uses, so they're validated on first use instead of all at once.
 */
export const SECRET_NAMES = [
  'MONGODB_URI',
  'WA_ACCESS_TOKEN',
  'WA_APP_SECRET',
  'WA_VERIFY_TOKEN',
  'JWT_SECRET',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

let cached: Config | undefined;

/** The only place that reads process.env. Throws on the first call if the environment is invalid. */
export function getConfig(): Config {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}

/** Returns a secret from the environment. Throws if it's missing or empty. */
export function getSecret(name: SecretName): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required secret ${name}`);
  return value;
}
