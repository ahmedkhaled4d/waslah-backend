import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { routes as conversationRoutes } from '../conversations';
import { routes as dealRoutes } from '../deals';
import { routes as inboxRoutes } from '../inboxes';
import { routes as labelRoutes } from '../labels';
import { routes as pipelineRoutes } from '../pipelines';
import { routes as userRoutes } from '../users';

const SERVERLESS_YML = new URL('../../../../serverless.yml', import.meta.url);

/** Function name in serverless.yml → route table its handler dispatches on. */
const TABLES: Record<string, Record<string, unknown>> = {
  'users-api': userRoutes,
  'inboxes-api': inboxRoutes,
  'conversations-api': conversationRoutes,
  'labels-api': labelRoutes,
  'pipelines-api': pipelineRoutes,
  'deals-api': dealRoutes,
};

/** Collects `- httpApi: 'METHOD /path'` events per function from serverless.yml. */
function httpApiEventsByFunction(yaml: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  let section = '';
  let fn = '';
  for (const line of yaml.split('\n')) {
    const top = /^(\w[\w-]*):/.exec(line);
    if (top?.[1]) section = top[1];
    if (section !== 'functions') continue;
    const name = /^ {2}([\w-]+):\s*$/.exec(line);
    if (name?.[1]) fn = name[1];
    const event = /^\s+- httpApi:\s*'([A-Z]+ \S+)'/.exec(line);
    if (event?.[1]) (result[fn] ??= []).push(event[1]);
  }
  return result;
}

describe('serverless.yml', () => {
  const events = httpApiEventsByFunction(readFileSync(SERVERLESS_YML, 'utf8'));

  it.each(Object.entries(TABLES))('%s declares exactly its route table', (fn, table) => {
    expect([...(events[fn] ?? [])].sort()).toEqual(Object.keys(table).sort());
  });

  it('routes the WhatsApp webhook', () => {
    expect(events['whatsapp-webhook']?.sort()).toEqual([
      'GET /webhooks/whatsapp',
      'POST /webhooks/whatsapp',
    ]);
  });

  it('has no HTTP functions without a route table', () => {
    expect(Object.keys(events).sort()).toEqual(
      [...Object.keys(TABLES), 'whatsapp-webhook'].sort(),
    );
  });
});
