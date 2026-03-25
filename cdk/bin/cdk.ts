#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AregStack } from '../lib/areg-stack';

const app = new cdk.App();

const stack = new AregStack(app, 'AregStack', {
  env: {
    account: '979952482911',
    region: 'us-east-2',
  },
  description: 'Application Registry (AREG) — all project resources',
  tags: { Project: 'AREG' },
});

cdk.Tags.of(stack).add('Project', 'AREG');
