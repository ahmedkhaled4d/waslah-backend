import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { routes as conversationRoutes } from '../src/functions/http/conversations';
import { routes as dealRoutes } from '../src/functions/http/deals';
import { routes as inboxRoutes } from '../src/functions/http/inboxes';
import { routes as labelRoutes } from '../src/functions/http/labels';
import { routes as pipelineRoutes } from '../src/functions/http/pipelines';
import { routes as userRoutes } from '../src/functions/http/users';
import type { RouteTable } from '../src/lib/http';

export interface WaslahStackProps extends StackProps {
  stage: 'dev' | 'prod';
  waPhoneNumberId: string;
  waWabaId: string;
  waGraphApiVersion: string;
}

const entry = (path: string) => fileURLToPath(new URL(`../src/functions/${path}`, import.meta.url));

export class WaslahStack extends Stack {
  constructor(scope: Construct, id: string, props: WaslahStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const isProd = stage === 'prod';

    // ---- Secrets: created empty-ish; set the real values in the console after first deploy.
    const secret = (name: string) =>
      new Secret(this, name, {
        secretName: `waslah/${stage}/${name}`,
        removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      });
    const secrets = {
      mongoUri: secret('mongodb-uri'),
      waAccessToken: secret('wa-access-token'),
      waAppSecret: secret('wa-app-secret'),
      waVerifyToken: secret('wa-verify-token'),
      jwt: secret('jwt-secret'),
    };

    // ---- Queues
    const inboundDlq = new Queue(this, 'WaInboundDlq', {
      queueName: `waslah-${stage}-wa-inbound-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
    });
    const inboundQueue = new Queue(this, 'WaInboundQueue', {
      queueName: `waslah-${stage}-wa-inbound`,
      visibilityTimeout: Duration.seconds(120),
      encryption: QueueEncryption.SQS_MANAGED,
      deadLetterQueue: { queue: inboundDlq, maxReceiveCount: 5 },
    });
    new Alarm(this, 'WaInboundDlqAlarm', {
      alarmName: `waslah-${stage}-wa-inbound-dlq-not-empty`,
      metric: inboundDlq.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(1) }),
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    // ---- Shared Lambda settings
    const environment = {
      STAGE: stage,
      MONGODB_URI_SECRET_ARN: secrets.mongoUri.secretArn,
      WA_ACCESS_TOKEN_SECRET_ARN: secrets.waAccessToken.secretArn,
      WA_APP_SECRET_ARN: secrets.waAppSecret.secretArn,
      WA_VERIFY_TOKEN_SECRET_ARN: secrets.waVerifyToken.secretArn,
      JWT_SECRET_ARN: secrets.jwt.secretArn,
      WA_PHONE_NUMBER_ID: props.waPhoneNumberId,
      WA_WABA_ID: props.waWabaId,
      WA_GRAPH_API_VERSION: props.waGraphApiVersion,
      WA_INBOUND_QUEUE_URL: inboundQueue.queueUrl,
      POWERTOOLS_LOG_LEVEL: isProd ? 'INFO' : 'DEBUG',
    };

    const fn = (name: string, path: string, opts: { timeout: number; memory?: number }) =>
      new NodejsFunction(this, name, {
        functionName: `waslah-${stage}-${name}`,
        entry: entry(path),
        handler: 'handler',
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: opts.memory ?? 512,
        timeout: Duration.seconds(opts.timeout),
        environment,
        logGroup: new LogGroup(this, `${name}Logs`, {
          logGroupName: `/aws/lambda/waslah-${stage}-${name}`,
          retention: isProd ? RetentionDays.THREE_MONTHS : RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
        bundling: {
          format: OutputFormat.ESM,
          target: 'node22',
          minify: true,
          sourceMap: true,
          // ESM bundles need a real `require` for CommonJS dependencies.
          banner:
            "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        },
      });

    // ---- WhatsApp webhook: verify + enqueue only (least privilege: no DB secret)
    const webhookFn = fn('whatsapp-webhook', 'http/whatsapp-webhook.ts', {
      timeout: 5,
      memory: 256,
    });
    secrets.waAppSecret.grantRead(webhookFn);
    secrets.waVerifyToken.grantRead(webhookFn);
    inboundQueue.grantSendMessages(webhookFn);

    // ---- Inbound consumer: saves messages
    const inboundFn = fn('wa-inbound', 'queues/wa-inbound.ts', { timeout: 20 });
    secrets.mongoUri.grantRead(inboundFn);
    inboundFn.addEventSource(
      new SqsEventSource(inboundQueue, { batchSize: 10, reportBatchItemFailures: true }),
    );

    // ---- HTTP API
    const api = new HttpApi(this, 'Api', {
      apiName: `waslah-${stage}`,
      corsPreflight: {
        allowOrigins: isProd ? [] : ['*'],
        allowHeaders: ['authorization', 'content-type'],
        allowMethods: [CorsHttpMethod.ANY],
      },
    });

    const webhookIntegration = new HttpLambdaIntegration('WebhookIntegration', webhookFn);
    api.addRoutes({
      path: '/webhooks/whatsapp',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: webhookIntegration,
    });

    const modules: { name: string; path: string; routes: RouteTable; sendsMessages?: boolean }[] = [
      { name: 'users-api', path: 'http/users.ts', routes: userRoutes },
      { name: 'inboxes-api', path: 'http/inboxes.ts', routes: inboxRoutes },
      {
        name: 'conversations-api',
        path: 'http/conversations.ts',
        routes: conversationRoutes,
        sendsMessages: true,
      },
      { name: 'labels-api', path: 'http/labels.ts', routes: labelRoutes },
      { name: 'pipelines-api', path: 'http/pipelines.ts', routes: pipelineRoutes },
      { name: 'deals-api', path: 'http/deals.ts', routes: dealRoutes },
    ];

    for (const mod of modules) {
      const handler = fn(mod.name, mod.path, { timeout: mod.sendsMessages ? 15 : 10 });
      secrets.mongoUri.grantRead(handler);
      secrets.jwt.grantRead(handler);
      if (mod.sendsMessages) secrets.waAccessToken.grantRead(handler);
      const integration = new HttpLambdaIntegration(`${mod.name}Integration`, handler);
      for (const routeKey of Object.keys(mod.routes)) {
        const [method, path] = routeKey.split(' ') as [keyof typeof HttpMethod, string];
        api.addRoutes({ path, methods: [HttpMethod[method]], integration });
      }
    }

    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'WebhookUrl', { value: `${api.apiEndpoint}/webhooks/whatsapp` });
  }
}
