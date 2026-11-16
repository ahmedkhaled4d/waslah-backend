import mongoose from 'mongoose';
import { getConfig } from './config';
import { getSecretValue } from './secrets';

mongoose.set('bufferCommands', false);

let connection: Promise<typeof mongoose> | undefined;

/** Connects once per Lambda container and reuses the connection across invocations. */
export function connectDb(): Promise<typeof mongoose> {
  connection ??= (async () => {
    const config = getConfig();
    const uri = await getSecretValue(config.MONGODB_URI_SECRET_ARN);
    return mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      // Indexes are built by `npm run sync-indexes` in prod, not on cold start.
      autoIndex: config.STAGE !== 'prod',
    });
  })().catch((err: unknown) => {
    connection = undefined;
    throw err;
  });
  return connection;
}

export const DUPLICATE_KEY = 11000;

export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === DUPLICATE_KEY;
}
