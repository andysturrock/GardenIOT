import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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

    // Create the temperature lambdas
    const temperatureGetLambda = new lambda.Function(this, "TemperatureGetLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
      handler: "temperature_get.lambdaHandler"
    });

    const temperaturePostLambda = new lambda.Function(this, "TemperaturePostLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
      handler: "temperature_post.lambdaHandler"
    });

    // And the moisture lambda
    const moistureGetLambda = new lambda.Function(this, "MoistureGetLambda", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
      handler: "moisture_get.lambdaHandler"
    });

    // Allow it access to SecretsManager.  Strangely there is no Read-only managed policy.
    const secretsManagerReadPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite");
    temperatureGetLambda.role?.addManagedPolicy(secretsManagerReadPolicy);

    // Allow the Lambdas appropriate access to the DyanamoDB tables
    props.temperatureHistoryTable.grantReadData(temperatureGetLambda);
    props.temperatureHistoryTable.grantReadWriteData(temperaturePostLambda);
    props.lastSensorReadingTable.grantReadData(temperatureGetLambda);
    props.lastSensorReadingTable.grantReadWriteData(temperaturePostLambda);

    const customDomainName = getEnv('CUSTOM_DOMAIN_NAME', false)!;
    const r53ZoneId = getEnv('R53_ZONE_ID', false)!;
    const lambdaVersion = getEnv('LAMBDA_VERSION', false)!;

    // Get hold of the hosted zone which has previously been created
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'R53Zone', {
      zoneName: customDomainName,
      hostedZoneId: r53ZoneId,
    });

    // Create the cert for the gateway.
    // Usefully, this writes the DNS Validation CNAME records to the R53 zone,
    // which is great as normal Cloudformation doesn't do that.
    const acmCertificateForCustomDomain = new acm.DnsValidatedCertificate(this, 'Certificate', {
      domainName: `api.${customDomainName}`,
      hostedZone: zone,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // Create the custom domain
    const customDomain = new apigateway.DomainName(this, 'CustomDomainName', {
      domainName: `api.${customDomainName}`,
      certificate: acmCertificateForCustomDomain,
      endpointType: apigateway.EndpointType.REGIONAL,
      securityPolicy: apigateway.SecurityPolicy.TLS_1_2
    });

    // This is the API Gateway which then calls the lambda.
    const api = new apigateway.RestApi(this, "APIGateway", {
      restApiName: "Garden IOT Service",
      description: "This service is for the Garden IOT project.",
      deploy: false // create the deployment below
    });

    // By default CDK creates a deployment and a "prod" stage.  That means the URL is something like
    // https://2z2ockh6g5.execute-api.eu-west-2.amazonaws.com/prod/
    // We want to create the stage to match the version id.
    // Semantic versioning has dots as separators but this is invalid in a URL
    // so replace the dots with underscores first.
    const versionIdForURL = lambdaVersion.replace(/\./g, '_');
    const apiGatewayDeployment = new apigateway.Deployment(this, 'ApiGatewayDeployment', {
      api: api
    });
    const stage = new apigateway.Stage(this, 'Stage', {
      deployment: apiGatewayDeployment,
      loggingLevel: apigateway.MethodLoggingLevel.INFO,
      dataTraceEnabled: true,
      stageName: versionIdForURL
    })

    // Connect the API to the lambdas
    const temperatureGetLambdaIntegration = new apigateway.LambdaIntegration(temperatureGetLambda, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' }
    });
    const temperaturePostLambdaIntegration = new apigateway.LambdaIntegration(temperaturePostLambda, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' }
    });
    const temperatureResource = api.root.addResource('temperature');
    temperatureResource.addMethod("GET", temperatureGetLambdaIntegration);
    temperatureResource.addMethod("POST", temperaturePostLambdaIntegration);

    const moistureGetLambdaIntegration = new apigateway.LambdaIntegration(moistureGetLambda, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' }
    });
    const moistureResource = api.root.addResource('moisture');
    moistureResource.addMethod("GET", moistureGetLambdaIntegration);

    // Create the R53 "A" record to map from the custom domain to the actual API URL
    new route53.ARecord(this, 'CustomDomainAliasRecord', {
      recordName: `api.${customDomainName}`,
      zone: zone,
      target: route53.RecordTarget.fromAlias(new targets.ApiGatewayDomain(customDomain))
    });
    // And path mapping to the API
    customDomain.addBasePathMapping(api, { basePath: `${versionIdForURL}`, stage: stage });
  }
}
