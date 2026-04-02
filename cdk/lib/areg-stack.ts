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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2auth from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2int from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventtargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { execSync } from 'child_process';
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

    const auditTable = new dynamodb.Table(this, 'AregDdbAudit', {
      tableName: 'areg-ddb-audit',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // AREG-42: Admin-managed lookup values (Service Hours, Service Level, Department)
    // PK=CONFIG#category, SK=VALUE#id
    const configTable = new dynamodb.Table(this, 'AregDdbConfig', {
      tableName: 'areg-ddb-config',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey:      { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Opt into shared APPS backup plan (nightly, 30-day retention)
    cdk.Tags.of(appsTable).add('ManagedBackup', 'true');
    cdk.Tags.of(auditTable).add('ManagedBackup', 'true');
    cdk.Tags.of(configTable).add('ManagedBackup', 'true');

    // Export table names for Lambda env vars
    new ssm.StringParameter(this, 'TableAppsName', {
      parameterName: '/areg/table-apps',
      stringValue: appsTable.tableName,
    });

    // ── AREG-6: Cognito User Pool ─────────────────────────────────────────────

    const userPool = new cognito.UserPool(this, 'AregCognitoUsers', {
      userPoolName: 'areg-cognito-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Use SES so verification emails come from no-reply@tmrs.studio instead of
      // Cognito's default domain (no-reply@verificationemail.com), which is blocked
      // by many corporate mail servers. CloudFormation can't change EmailSendingAccount
      // after pool creation, so the live pool was updated via CLI (AREG-37).
      email: cognito.UserPoolEmail.withSES({
        sesRegion: 'us-east-1',
        fromEmail: 'no-reply@tmrs.studio',
        sesVerifiedDomain: 'tmrs.studio',
      }),
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
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

    // ── AREG-59: S3 bucket for contract document uploads ──────────────────────

    const contractsBucket = new s3.Bucket(this, 'AregS3Contracts', {
      bucketName: `areg-s3-contracts-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
        allowedOrigins: ['https://areg.tmrs.studio'],
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],
    });
    cdk.Tags.of(contractsBucket).add('Project', 'AREG');

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

    // ── AREG-7: Lambda + API Gateway HTTP API ─────────────────────────────────

    const apiLambda = new lambda.Function(this, 'AregLambdaApi', {
      functionName: 'areg-lambda-api',
      runtime:      lambda.Runtime.NODEJS_20_X,
      handler:      'index.handler',
      code:         lambda.Code.fromAsset(path.join(__dirname, '../../lambda/dist')),
      environment: {
        TABLE_APPS:        'areg-ddb-apps',
        TABLE_AUDIT:       'areg-ddb-audit',
        TABLE_CONFIG:      'areg-ddb-config',
        ADMIN_APPS_TABLE:  'tmrs-admin-ddb-apps',
        BUCKET_CONTRACTS:  contractsBucket.bucketName,
        REGION:            this.region,
        USER_POOL_ID:      'us-east-2_Ts0PtOaEc',  // stable — retained pool, see /areg/cognito-user-pool-id
        DEPLOY_VERSION:    execSync('git describe --tags --abbrev=0').toString().trim().replace(/^v/, ''),
      },
      timeout: cdk.Duration.seconds(29),
    });

    // Grant Lambda read/write on all tables
    appsTable.grantReadWriteData(apiLambda);
    auditTable.grantReadWriteData(apiLambda);
    configTable.grantReadWriteData(apiLambda);

    // AREG-59: Grant Lambda access to contracts bucket (presigned URL generation + delete)
    contractsBucket.grantReadWrite(apiLambda);

    // Pre-signup trigger — enforces allowed_domains setting
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, apiLambda);

    // Post-authentication trigger — records last sign-in timestamp to DynamoDB
    userPool.addTrigger(cognito.UserPoolOperation.POST_AUTHENTICATION, apiLambda);

    // Role groups (admin, editor, viewer) exist in AREG Cognito pool — created once via CLI,
    // not managed by CDK to avoid re-creation conflicts on existing pools.

    // AREG-29: pre-signup Lambda reads allowedDomains from ADMIN app registry
    apiLambda.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['dynamodb:GetItem'],
      resources: [`arn:aws:dynamodb:us-east-2:979952482911:table/tmrs-admin-ddb-apps`],
    }));

    const httpApi = new apigwv2.HttpApi(this, 'AregApigwApi', {
      apiName:     'areg-apigw-api',
      description: 'AREG HTTP API',
      corsPreflight: {
        allowOrigins: ['https://areg.tmrs.studio'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    // Literal IDs avoid circular dependency (User Pool ↔ Lambda trigger)
    const jwtAuthorizer = new apigwv2auth.HttpJwtAuthorizer(
      'AregCognitoJwtAuth',
      'https://cognito-idp.us-east-2.amazonaws.com/us-east-2_Ts0PtOaEc',
      {
        jwtAudience: ['117u215jcpi0n2nsd4ud5fdn5j'],  // stable — retained app client, see /areg/cognito-app-client-id
        authorizerName: 'areg-cognito-jwt-auth',
      },
    );

    const lambdaIntegration = new apigwv2int.HttpLambdaIntegration(
      'AregLambdaIntegration',
      apiLambda,
    );

    // GET /health — no auth
    httpApi.addRoutes({
      path:        '/health',
      methods:     [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // GET /version — no auth
    httpApi.addRoutes({
      path:        '/version',
      methods:     [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    // All other routes — Cognito JWT required (OPTIONS excluded so CORS preflight passes)
    httpApi.addRoutes({
      path:        '/{proxy+}',
      methods:     [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.DELETE,
        apigwv2.HttpMethod.PATCH,
      ],
      integration: lambdaIntegration,
      authorizer:  jwtAuthorizer,
    });

    // EventBridge keep-warm rule (every 5 minutes)
    new events.Rule(this, 'AregEbKeepWarm', {
      ruleName:    'areg-eb-keep-warm',
      description: 'Keep areg-lambda-api warm',
      schedule:    events.Schedule.rate(cdk.Duration.minutes(5)),
      targets:     [new eventtargets.LambdaFunction(apiLambda)],
    });

    // ── AREG-20: Renewal alerts Lambda ────────────────────────────────────────

    const alertsLambda = new lambda.Function(this, 'AregLambdaRenewalAlerts', {
      functionName: 'areg-lambda-renewal-alerts',
      runtime:      lambda.Runtime.NODEJS_20_X,
      handler:      'index.handler',
      code:         lambda.Code.fromAsset(path.join(__dirname, '../../lambda-alerts/dist')),
      environment: {
        TABLE_APPS:   'areg-ddb-apps',
        REGION:       this.region,
        ALERT_SENDER: 'noreply@tmrs.studio',
      },
      timeout: cdk.Duration.seconds(60),
    });

    appsTable.grantReadData(alertsLambda);

    alertsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: [`arn:aws:ses:us-east-1:${this.account}:identity/tmrs.studio`],
    }));

    new events.Rule(this, 'AregEbRenewalAlertsDaily', {
      ruleName:    'areg-eb-renewal-alerts-daily',
      description: 'Daily renewal alert emails',
      schedule:    events.Schedule.cron({ hour: '10', minute: '0' }),
      targets:     [new eventtargets.LambdaFunction(alertsLambda)],
    });

    // Store API endpoint
    new ssm.StringParameter(this, 'ApiEndpoint', {
      parameterName: '/areg/api-endpoint',
      stringValue:   httpApi.apiEndpoint,
    });

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'UserPoolId',    { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'AppClientId',  { value: appClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CfDomainName', { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, 'CfId',         { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'ApiUrl',       { value: httpApi.apiEndpoint });
  }
}
