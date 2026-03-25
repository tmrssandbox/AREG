import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class AregStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Project marker — confirms stack is deployed and region is correct
    new ssm.StringParameter(this, 'AregProjectMarker', {
      parameterName: '/areg/project',
      stringValue: 'AREG',
      description: 'Application Registry project marker',
    });

    // Sprint 1+ resources will be added here
  }
}
