import { App } from 'aws-cdk-lib';
import { WaslahStack } from './waslah-stack';

const app = new App();

function required(key: string): string {
  const value: unknown = app.node.tryGetContext(key);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `Missing CDK context "${key}". Pass it with -c ${key}=... or set it in cdk.context.json`,
    );
  }
  return value;
}

const stage = required('stage');
if (stage !== 'dev' && stage !== 'prod') throw new Error('stage must be dev or prod');

new WaslahStack(app, `waslah-${stage}`, {
  stage,
  waPhoneNumberId: required('waPhoneNumberId'),
  waWabaId: required('waWabaId'),
  waGraphApiVersion: required('waGraphApiVersion'),
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
