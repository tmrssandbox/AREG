import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class AregStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── Project marker ────────────────────────────────────────────────────────
    new ssm.StringParameter(this, 'AregProjectMarker', {
      parameterName: '/areg/project',
      stringValue: 'AREG',
      description: 'Application Registry project marker',
    });

    // ── AREG-5: DynamoDB tables ───────────────────────────────────────────────

    const appsTable = new dynamodb.Table(this, 'AregDdbApps', {
      tableName: 'areg-ddb-apps',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    appsTable.addGlobalSecondaryIndex({
      indexName:            'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new dynamodb.Table(this, 'AregDdbAudit', {
      tableName: 'areg-ddb-audit',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Export table names for Lambda env vars
    new ssm.StringParameter(this, 'TableAppsName', {
      parameterName: '/areg/table-apps',
      stringValue: appsTable.tableName,
    });

    // ── AREG-6: Cognito User Pool ─────────────────────────────────────────────

    const userPool = new cognito.UserPool(this, 'AregCognitoUsers', {
      userPoolName: 'areg-cognito-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      customAttributes: {
        role: new cognito.StringAttribute({ mutable: true }),
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const appClient = userPool.addClient('AregCognitoAppClient', {
      userPoolClientName: 'areg-cognito-app-client',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
    });

    // Store IDs for Lambda and frontend config
    new ssm.StringParameter(this, 'CognitoUserPoolId', {
      parameterName: '/areg/cognito-user-pool-id',
      stringValue: userPool.userPoolId,
    });
    new ssm.StringParameter(this, 'CognitoAppClientId', {
      parameterName: '/areg/cognito-app-client-id',
      stringValue: appClient.userPoolClientId,
    });

    // ── AREG-8: S3 + CloudFront for frontend ──────────────────────────────────

    const frontendBucket = new s3.Bucket(this, 'AregS3Frontend', {
      bucketName: `areg-s3-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Look up existing ACM cert in us-east-1 (required for CloudFront)
    const cert = acm.Certificate.fromCertificateArn(
      this,
      'AregCert',
      'arn:aws:acm:us-east-1:979952482911:certificate/a9b9cfbe-3daf-4c06-bd6c-2f52c1ce5bf8',
    );

    const distribution = new cloudfront.Distribution(this, 'AregCfWeb', {
      comment: 'areg-cf-web',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      domainNames: ['areg.tmrs.studio'],
      certificate: cert,
    });

    // Route 53 alias record
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'TmrsStudioZone', {
      hostedZoneId: 'Z03689722459VD8GPC4VM',
      zoneName: 'tmrs.studio',
    });

    new route53.ARecord(this, 'AregDnsRecord', {
      zone: hostedZone,
      recordName: 'areg',
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution),
      ),
    });

    // Store CloudFront distribution ID
    new ssm.StringParameter(this, 'CfDistributionId', {
      parameterName: '/areg/cf-distribution-id',
      stringValue: distribution.distributionId,
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId',    { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'AppClientId',  { value: appClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CfDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'CfId',         { value: distribution.distributionId });
  }
}
