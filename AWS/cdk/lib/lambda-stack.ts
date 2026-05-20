import { Stack, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { getEnv, LambdaStackProps } from './common';

export class LambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const policyArn = getEnv('AWS_BOUNDARY_POLICY_ARN', true);
    if(policyArn) {
      const boundary = iam.ManagedPolicy.fromManagedPolicyArn(this, 'Boundary', policyArn);
      iam.PermissionsBoundary.of(this).apply(boundary);
    }

    const makeFunction = (id: string, handler: string) => {
      const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
        logGroupName: `/aws/lambda/${id}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      return new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        code: lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
        handler,
        logGroup,
        timeout: Duration.seconds(10),
        memorySize: 256,
        environment: {
          TEMPERATURE_HISTORY_TABLE: props.temperatureHistoryTable.tableName,
        },
      });
    };

    const temperatureGetLambda = makeFunction("TemperatureGetLambda", "temperature_get.lambdaHandler");
    const temperaturePostLambda = makeFunction("TemperaturePostLambda", "temperature_post.lambdaHandler");

    props.temperatureHistoryTable.grantReadData(temperatureGetLambda);
    props.temperatureHistoryTable.grantReadWriteData(temperaturePostLambda);

    const customDomainName = getEnv('CUSTOM_DOMAIN_NAME', false)!;
    const r53ZoneId = getEnv('R53_ZONE_ID', false)!;
    const lambdaVersion = getEnv('LAMBDA_VERSION', false)!;

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'R53Zone', {
      zoneName: customDomainName,
      hostedZoneId: r53ZoneId,
    });

    const acmCertificateForCustomDomain = new acm.Certificate(this, 'Certificate', {
      domainName: `api.${customDomainName}`,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    const customDomain = new apigateway.DomainName(this, 'CustomDomainName', {
      domainName: `api.${customDomainName}`,
      certificate: acmCertificateForCustomDomain,
      endpointType: apigateway.EndpointType.REGIONAL,
      securityPolicy: apigateway.SecurityPolicy.TLS_1_2
    });

    const api = new apigateway.RestApi(this, "APIGateway", {
      restApiName: "Garden IOT Service",
      description: "This service is for the Garden IOT project.",
      deploy: false
    });

    // Stage name must be URL-safe; semver dots become underscores.
    const versionIdForURL = lambdaVersion.replace(/\./g, '_');
    const apiGatewayDeployment = new apigateway.Deployment(this, 'ApiGatewayDeployment', {
      api: api
    });
    // Force a new logical ID whenever the API shape changes, so the stage
    // actually picks up changes like apiKeyRequired. Without this, CDK
    // reuses the existing Deployment and the stage keeps serving stale config.
    apiGatewayDeployment.addToLogicalId({
      methods: ['GET /temperature', 'POST /temperature'],
      apiKeyRequired: { 'POST /temperature': true },
    });
    const stage = new apigateway.Stage(this, 'Stage', {
      deployment: apiGatewayDeployment,
      loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      dataTraceEnabled: false,
      stageName: versionIdForURL
    });

    const temperatureGetLambdaIntegration = new apigateway.LambdaIntegration(temperatureGetLambda);
    const temperaturePostLambdaIntegration = new apigateway.LambdaIntegration(temperaturePostLambda);
    const temperatureResource = api.root.addResource('temperature');
    temperatureResource.addMethod("GET", temperatureGetLambdaIntegration);
    temperatureResource.addMethod("POST", temperaturePostLambdaIntegration, {
      apiKeyRequired: true,
    });

    // API key + usage plan: protects the write endpoint from random
    // internet traffic. Retrieve the key value with
    //   aws apigateway get-api-key --api-key <id> --include-value
    const apiKey = new apigateway.ApiKey(this, 'WriteApiKey', {
      apiKeyName: 'GardenIOTWriteKey',
      description: 'Required for POST /temperature. Distribute to writers (e.g. sensor publishers).',
    });
    const usagePlan = new apigateway.UsagePlan(this, 'WriteUsagePlan', {
      name: 'GardenIOTWritePlan',
      throttle: { rateLimit: 5, burstLimit: 10 },
      quota: { limit: 10000, period: apigateway.Period.DAY },
    });
    usagePlan.addApiKey(apiKey);
    usagePlan.addApiStage({ stage });

    new route53.ARecord(this, 'CustomDomainAliasRecord', {
      recordName: `api.${customDomainName}`,
      zone: zone,
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(customDomain))
    });
    customDomain.addBasePathMapping(api, { basePath: `${versionIdForURL}`, stage: stage });
  }
}
