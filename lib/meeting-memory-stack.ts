import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export class MeetingMemoryStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const modelId = new cdk.CfnParameter(this, 'BedrockModelId', {
      type: 'String',
      description: 'A currently available Bedrock model or inference profile ID that supports Converse',
      default: 'replace-with-current-model-id',
    });

    const media = new s3.Bucket(this, 'MeetingMedia', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ id: 'ExpireRawMeetingData', expiration: cdk.Duration.days(30), abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const site = new s3.Bucket(this, 'WebSite', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const table = new dynamodb.Table(this, 'Meetings', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: 'job-name-index',
      partitionKey: { name: 'transcriptionJobName', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(site),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        responseHeadersPolicy: new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
          customHeadersBehavior: { customHeaders: [{ header: 'Permissions-Policy', value: 'microphone=(self)', override: true }] },
          securityHeadersBehavior: {
            contentTypeOptions: { override: true },
            frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
            referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
            strictTransportSecurity: { accessControlMaxAge: cdk.Duration.days(365), includeSubdomains: true, preload: true, override: true },
          },
        }),
      },
    });
    const siteOrigin = `https://${distribution.distributionDomainName}`;
    media.addCorsRule({ allowedOrigins: [siteOrigin], allowedMethods: [s3.HttpMethods.POST], allowedHeaders: ['*'], maxAge: 600 });

    const users = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: true, signInAliases: { email: true }, autoVerify: { email: true },
      passwordPolicy: { minLength: 10, requireDigits: true, requireLowercase: true, requireUppercase: true, requireSymbols: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const domain = users.addDomain('Domain', { cognitoDomain: { domainPrefix: `meeting-memory-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}` } });
    const webClient = users.addClient('WebClient', {
      generateSecret: false, preventUserExistenceErrors: true,
      oAuth: { flows: { authorizationCodeGrant: true }, scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL], callbackUrls: [`${siteOrigin}/callback.html`], logoutUrls: [`${siteOrigin}/`] },
    });

    const common: Omit<nodejs.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_22_X, architecture: lambda.Architecture.ARM_64,
      memorySize: 512, timeout: cdk.Duration.seconds(20), tracing: lambda.Tracing.ACTIVE,
      environment: { TABLE_NAME: table.tableName, BUCKET_NAME: media.bucketName },
      bundling: { minify: true, sourceMap: true, target: 'node22', format: nodejs.OutputFormat.ESM },
    };
    const ingest = this.function('IngestApi', '../src/functions/ingest-api.ts', common);
    const meetings = this.function('MeetingsApi', '../src/functions/meetings-api.ts', common);
    const processor = this.function('TranscriptProcessor', '../src/functions/process-transcript.ts', {
      ...common, timeout: cdk.Duration.minutes(2), memorySize: 1024,
      environment: { ...common.environment, BEDROCK_MODEL_ID: modelId.valueAsString },
    });
    table.grantReadWriteData(ingest);
    table.grantReadWriteData(meetings);
    table.grantReadWriteData(processor);
    media.grantPut(ingest, 'uploads/*');
    media.grantRead(ingest, 'uploads/*');
    media.grantRead(processor, 'transcripts/*');
    ingest.addToRolePolicy(new iam.PolicyStatement({ actions: ['transcribe:StartTranscriptionJob'], resources: ['*'] }));
    processor.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:${cdk.Aws.PARTITION}:bedrock:*::foundation-model/*`,
        `arn:${cdk.Aws.PARTITION}:bedrock:*:${cdk.Aws.ACCOUNT_ID}:inference-profile/*`,
      ],
    }));

    const processorDlq = new sqs.Queue(this, 'ProcessorDlq', { enforceSSL: true, retentionPeriod: cdk.Duration.days(14) });
    new events.Rule(this, 'TranscribeEvents', {
      eventPattern: { source: ['aws.transcribe'], detailType: ['Transcribe Job State Change'], detail: { TranscriptionJobStatus: ['COMPLETED', 'FAILED'] } },
      targets: [new eventTargets.LambdaFunction(processor, { deadLetterQueue: processorDlq, retryAttempts: 2, maxEventAge: cdk.Duration.hours(2) })],
    });

    const api = new apigwv2.HttpApi(this, 'Api', {
      corsPreflight: { allowOrigins: [siteOrigin], allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.PATCH], allowHeaders: ['authorization', 'content-type'], maxAge: cdk.Duration.hours(1) },
    });
    const auth = new authorizers.HttpJwtAuthorizer('JwtAuthorizer', users.userPoolProviderUrl, { jwtAudience: [webClient.userPoolClientId] });
    const ingestIntegration = new integrations.HttpLambdaIntegration('IngestIntegration', ingest);
    const meetingsIntegration = new integrations.HttpLambdaIntegration('MeetingsIntegration', meetings);
    api.addRoutes({ path: '/meetings', methods: [apigwv2.HttpMethod.POST], integration: ingestIntegration, authorizer: auth });
    api.addRoutes({ path: '/meetings/{meetingId}/start', methods: [apigwv2.HttpMethod.POST], integration: ingestIntegration, authorizer: auth });
    api.addRoutes({ path: '/meetings', methods: [apigwv2.HttpMethod.GET], integration: meetingsIntegration, authorizer: auth });
    api.addRoutes({ path: '/meetings/{meetingId}', methods: [apigwv2.HttpMethod.GET], integration: meetingsIntegration, authorizer: auth });
    api.addRoutes({ path: '/meetings/{meetingId}/actions/{actionId}', methods: [apigwv2.HttpMethod.PATCH], integration: meetingsIntegration, authorizer: auth });

    new s3deploy.BucketDeployment(this, 'DeployWeb', {
      destinationBucket: site,
      sources: [s3deploy.Source.asset(path.join(currentDir, '../web')), s3deploy.Source.data('config.json', JSON.stringify({ mode: 'aws', apiUrl: api.apiEndpoint, authDomain: domain.baseUrl(), clientId: webClient.userPoolClientId, redirectUri: `${siteOrigin}/callback.html`, logoutUri: `${siteOrigin}/` }))],
      distribution, distributionPaths: ['/*'],
    });
    new cdk.CfnOutput(this, 'WebUrl', { value: siteOrigin });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
  }

  private function(id: string, entry: string, props: Omit<nodejs.NodejsFunctionProps, 'entry'>): nodejs.NodejsFunction {
    return new nodejs.NodejsFunction(this, id, { ...props, entry: path.join(currentDir, entry), handler: 'handler', logGroup: new logs.LogGroup(this, `${id}Logs`, { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: cdk.RemovalPolicy.DESTROY }) });
  }
}
