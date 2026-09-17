#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MeetingMemoryStack } from '../lib/meeting-memory-stack.js';

const app = new cdk.App();
new MeetingMemoryStack(app, 'MeetingMemoryStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2' },
});
