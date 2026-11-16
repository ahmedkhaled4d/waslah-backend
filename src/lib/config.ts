import { z } from 'zod';

const EnvSchema = z.object({
  STAGE: z.enum(['dev', 'prod']).default('dev'),
  MONGODB_URI_SECRET_ARN: z.string().min(1),
  WA_ACCESS_TOKEN_SECRET_ARN: z.string().min(1),
  WA_APP_SECRET_ARN: z.string().min(1),
  WA_VERIFY_TOKEN_SECRET_ARN: z.string().min(1),
  WA_PHONE_NUMBER_ID: z.string().min(1),
  WA_WABA_ID: z.string().min(1),
  WA_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'Expected a version like v23.0'),
  WA_INBOUND_QUEUE_URL: z.string().url(),
  JWT_SECRET_ARN: z.string().min(1),
});

export type Config = z.infer<typeof EnvSchema>;

let cached: Config | undefined;

/** The only place that reads process.env. Throws on the first call if the environment is invalid. */
export function getConfig(): Config {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
