import { createStreamingAPIClient, createRestAPIClient } from "masto";
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { SignatureDefinition } from "./types/signatureDefinition";

config();

const BaseUrl = process.env.BASE_URL;
const streamingApiUrl = BaseUrl + '/api/v1/streaming';
const accessToken = process.env.ACCESS_TOKEN;

const DISABLE_SEND_REPORTS = process.env.DISABLE_SEND_REPORTS === 'true';
const DISABLE_SUSPEND_ACCOUNTS = process.env.DISABLE_SUSPEND_ACCOUNTS === 'true';
const DISABLE_LIMIT_ACCOUNTS = process.env.DISABLE_LIMIT_ACCOUNTS === 'true';
const DISABLE_SIGNATURES = process.env.DISABLE_SIGNATURES?.split(',') || [];

const showDebugLog = process.env.LOG_DEBUG === 'true';
if (showDebugLog) {
  console.debug = console.log;
} else {
  console.debug = () => { };
}

const showInfoLog = process.env.LOG_INFO === 'true';
if (showInfoLog) {
  console.info = console.log;
} else {
  console.info = () => { };
}

async function loadSignatureFiles(): Promise<SignatureDefinition[]> {
  const signaturesDir = path.join(__dirname, 'signatures');
  const files = await fs.promises.readdir(signaturesDir);
  return files.map(file => {
    const moduleName = file.split('.').slice(0, -1).join('.');

    if (DISABLE_SIGNATURES.includes(moduleName)) {
      console.info(`Disabled signature: ${moduleName}`);
      return {
        check: () => ({ isSpam: false }),
        signatureName: moduleName
      };
    }

    const signatureModule = require(path.join(signaturesDir, file));
    console.info(`Loaded signature: ${moduleName}`);
    return {
      check: signatureModule.default,
      signatureName: moduleName
    };
  });
}

async function main() {
  if (!BaseUrl || !accessToken || !streamingApiUrl) {
    console.error('API URL and Access Token are required.');
    return;
  }

  console.info('Mastodon spam detecter started.');

  if (DISABLE_SEND_REPORTS && DISABLE_SUSPEND_ACCOUNTS && DISABLE_LIMIT_ACCOUNTS) {
    console.warn('All actions are disabled. No actions will be taken.');
  }

  const masto = createStreamingAPIClient({
    streamingApiUrl: streamingApiUrl,
    accessToken: accessToken,
  });

  const rest = createRestAPIClient({
    url: BaseUrl,
    accessToken: accessToken,
  });

  const signatures = await loadSignatureFiles();

  for await (const event of masto.public.subscribe()) {
    switch (event.event) {
      case "update": {
        for (const { check, signatureName } of signatures) {
          const { id: postId } = event.payload;
          const { isSpam, reason, actions } = check(event.payload);
          if (isSpam) {
            const actionsToTake = Object.entries(actions)
              .filter(([_, value]) => value)
              .map(([key]) => key)
              .join(', ');

            console.error(`[${postId}] Spam detected\u0007🚨: ${signatureName} ${reason} (Actions: ${actionsToTake}) -- ${JSON.stringify(event.payload)}`);

            if (actions.sendReport && !DISABLE_SEND_REPORTS) {
              const report = await rest.v1.reports.create({
                accountId: event.payload.account.id,
                statusIds: [event.payload.id],
                comment: `spam detected by ${reason}`,
                category: 'spam',
                forward: true,
              });
              console.log(`[${postId}] Created report: ${report.id}`);
            }

            if (actions.suspendAccount && !DISABLE_SUSPEND_ACCOUNTS) {
              await rest.v1.admin.accounts.$select(event.payload.account.id).action.create(
                { type: 'suspend' }
              );
              console.log(`[${postId}] Account suspended: ${event.payload.account.id}`);
            } else if (actions.limitAccount && DISABLE_LIMIT_ACCOUNTS) {
              await rest.v1.admin.accounts.$select(event.payload.account.id).action.create(
                { type: 'silence' }
              );
              console.log(`[${postId}] Account limited / silenced: ${event.payload.account.id}`);
            }

            break;
          }
        }
      }

      default: {
        break;
      }
    }
  }
}

main();
