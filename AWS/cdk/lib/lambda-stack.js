"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaStack = void 0;
const cdk = require("@aws-cdk/core");
const targets = require("@aws-cdk/aws-route53-targets");
const lambda = require("@aws-cdk/aws-lambda");
const iam = require("@aws-cdk/aws-iam");
const route53 = require("@aws-cdk/aws-route53");
const acm = require("@aws-cdk/aws-certificatemanager");
const apigateway = require("@aws-cdk/aws-apigateway");
const common_1 = require("./common");
class LambdaStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a;
        super(scope, id, props);
        const policyArn = common_1.default('AWS_BOUNDARY_POLICY_ARN');
        if (policyArn) {
            const boundary = iam.ManagedPolicy.fromManagedPolicyArn(this, 'Boundary', policyArn);
            iam.PermissionsBoundary.of(this).apply(boundary);
        }
        // Create the temperature lambda
        const temperatureLambda = new lambda.Function(this, "TemperatureLambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
            handler: "temperature.lambdaHandler",
            timeout: cdk.Duration.minutes(5),
        });
        // And the moisture lambda
        const moistureLambda = new lambda.Function(this, "MoistureLambda", {
            runtime: lambda.Runtime.NODEJS_14_X,
            code: lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
            handler: "moisture.lambdaHandler",
            timeout: cdk.Duration.minutes(5),
        });
        // Allow it access to SecretsManager.  Strangely there is no Read-only managed policy.
        const secretsManagerReadPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite");
        (_a = temperatureLambda.role) === null || _a === void 0 ? void 0 : _a.addManagedPolicy(secretsManagerReadPolicy);
        const customDomainName = common_1.default('CUSTOM_DOMAIN_NAME');
        const r53ZoneId = common_1.default('R53_ZONE_ID');
        const versionId = '1.2.3.4';
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
        const versionIdForURL = versionId.replace(/\./g, '_');
        const apiGatewayDeployment = new apigateway.Deployment(this, 'ApiGatewayDeployment', {
            api: api
        });
        const stage = new apigateway.Stage(this, 'Stage', {
            deployment: apiGatewayDeployment,
            loggingLevel: apigateway.MethodLoggingLevel.INFO,
            dataTraceEnabled: true,
            stageName: versionIdForURL
        });
        // Connect the API to the lambdas
        const temperatureLambdaIntegration = new apigateway.LambdaIntegration(temperatureLambda, {
            requestTemplates: { "application/json": '{ "statusCode": "200" }' }
        });
        const temperatureResource = api.root.addResource('temperature');
        temperatureResource.addMethod("GET", temperatureLambdaIntegration);
        const moistureLambdaIntegration = new apigateway.LambdaIntegration(moistureLambda, {
            requestTemplates: { "application/json": '{ "statusCode": "200" }' }
        });
        const moistureResource = api.root.addResource('moisture');
        moistureResource.addMethod("GET", moistureLambdaIntegration);
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
exports.LambdaStack = LambdaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFtYmRhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHFDQUFxQztBQUNyQyx3REFBd0Q7QUFDeEQsOENBQThDO0FBQzlDLHdDQUF3QztBQUN4QyxnREFBZ0Q7QUFDaEQsdURBQXVEO0FBQ3ZELHNEQUFzRDtBQUN0RCxxQ0FBOEI7QUFFOUIsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEMsWUFBWSxLQUFvQixFQUFFLEVBQVUsRUFBRSxLQUFzQjs7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxTQUFTLEdBQUcsZ0JBQU0sQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3BELElBQUcsU0FBUyxFQUFFO1lBQ1osTUFBTSxRQUFRLEdBQUcsR0FBRyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3JGLEdBQUcsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQ2xEO1FBRUQsZ0NBQWdDO1FBQ2hDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUN2RSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQ0FBZ0MsQ0FBQztZQUM3RCxPQUFPLEVBQUUsMkJBQTJCO1lBQ3BDLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7U0FDakMsQ0FBQyxDQUFDO1FBRUgsMEJBQTBCO1FBQzFCLE1BQU0sY0FBYyxHQUFHLElBQUksTUFBTSxD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QWdCLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSx5QkFBeUIsRUFBRTtTQUNwRSxDQUFDLENBQUM7UUFDSCxNQUFNLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2hFLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztRQUVuRSxNQUFNLHlCQUF5QixHQUFHLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLGNBQWMsRUFBRTtZQUNqRixnQkFBZ0IsRUFBRSxFQUFFLGtCQUFrQixFQUFFLHlCQUF5QixFQUFFO1NBQ3BFLENBQUMsQ0FBQztRQUNILE1BQU0sZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDMUQsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO1FBRTdELGdGQUFnRjtRQUNoRixJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ25ELFVBQVUsRUFBRSxPQUFPLGdCQUFnQixFQUFFO1lBQ3JDLElBQUksRUFBRSxJQUFJO1lBQ1YsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxDQUFDLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxDQUFDO1NBQ25GLENBQUMsQ0FBQztRQUNILDhCQUE4QjtRQUM5QixZQUFZLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEVBQUUsUUFBUSxFQUFFLEdBQUcsZUFBZSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFFekYsQ0FBQztDQUNGO0FBdkdELGtDQXVHQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnQGF3cy1jZGsvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcIkBhd3MtY2RrL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdAYXdzLWNkay9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnQGF3cy1jZGsvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gXCJAYXdzLWNkay9hd3MtYXBpZ2F0ZXdheVwiO1xuaW1wb3J0IGdldEVudiBmcm9tICcuL2NvbW1vbic7XG5cbmV4cG9ydCBjbGFzcyBMYW1iZGFTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCBwb2xpY3lBcm4gPSBnZXRFbnYoJ0FXU19CT1VOREFSWV9QT0xJQ1lfQVJOJyk7XG4gICAgaWYocG9saWN5QXJuKSB7XG4gICAgICBjb25zdCBib3VuZGFyeSA9IGlhbS5NYW5hZ2VkUG9saWN5LmZyb21NYW5hZ2VkUG9saWN5QXJuKHRoaXMsICdCb3VuZGFyeScsIHBvbGljeUFybik7XG4gICAgICBpYW0uUGVybWlzc2lvbnNCb3VuZGFyeS5vZih0aGlzKS5hcHBseShib3VuZGFyeSk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSB0ZW1wZXJhdHVyZSBsYW1iZGFcbiAgICBjb25zdCB0ZW1wZXJhdHVyZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJUZW1wZXJhdHVyZUxhbWJkYVwiLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcIi4uL2xhbWJkYS1jb2RlL2Rpc3QvbGFtYmRhLnppcFwiKSxcbiAgICAgIGhhbmRsZXI6IFwidGVtcGVyYXR1cmUubGFtYmRhSGFuZGxlclwiLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksIC8vIDUgbWlucyBzaG91bGQgYmUgbW9yZSB0aGFuIGVub3VnaC5cbiAgICB9KTtcblxuICAgIC8vIEFuZCB0aGUgbW9pc3R1cmUgbGFtYmRhXG4gICAgY29uc3QgbW9pc3R1cmVMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiTW9pc3R1cmVMYW1iZGFcIiwge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCIuLi9sYW1iZGEtY29kZS9kaXN0L2xhbWJkYS56aXBcIiksXG4gICAgICBoYW5kbGVyOiBcIm1vaXN0dXJlLmxhbWJkYUhhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLCAvLyA1IG1pbnMgc2hvdWxkIGJlIG1vcmUgdGhhbiBlbm91Z2guXG4gICAgfSk7XG5cbiAgICAvLyBBbGxvdyBpdCBhY2Nlc3MgdG8gU2VjcmV0c01hbmFnZXIuICBTdHJhbmdlbHkgdGhlcmUgaXMgbm8gUmVhZC1vbmx5IG1hbmFnZWQgcG9saWN5LlxuICAgIGNvbnN0IHNlY3JldHNNYW5hZ2VyUmVhZFBvbGljeSA9IGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZShcIlNlY3JldHNNYW5hZ2VyUmVhZFdyaXRlXCIpO1xuICAgIHRlbXBlcmF0dXJlTGFtYmRhLnJvbGU/LmFkZE1hbmFnZWRQb2xpY3koc2VjcmV0c01hbmFnZXJSZWFkUG9saWN5KTtcblxuICAgIGNvbnN0IGN1c3RvbURvbWFpbk5hbWUgPSBnZXRFbnYoJ0NVU1RPTV9ET01BSU5fTkFNRScpITtcbiAgICBjb25zdCByNTNab25lSWQgPSBnZXRFbnYoJ1I1M19aT05FX0lEJykhO1xuICAgIGNvbnN0IHZlcnNpb25JZD0nMS4yLjMuNCc7XG5cbiAgICAvLyBHZXQgaG9sZCBvZiB0aGUgaG9zdGVkIHpvbmUgd2hpY2ggaGFzIHByZXZpb3VzbHkgYmVlbiBjcmVhdGVkXG4gICAgY29uc3Qgem9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ1I1M1pvbmUnLCB7XG4gICAgICB6b25lTmFtZTogY3VzdG9tRG9tYWluTmFtZSxcbiAgICAgIGhvc3RlZFpvbmVJZDogcjUzWm9uZUlkLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjZXJ0IGZvciB0aGUgZ2F0ZXdheS5cbiAgICAvLyBVc2VmdWxseSwgdGhpcyB3cml0ZXMgdGhlIEROUyBWYWxpZGF0aW9uIENOQU1FIHJlY29yZHMgdG8gdGhlIFI1MyB6b25lLFxuICAgIC8vIHdoaWNoIGlzIGdyZWF0IGFzIG5vcm1hbCBDbG91ZGZvcm1hdGlvbiBkb2Vzbid0IGRvIHRoYXQuXG4gICAgY29uc3QgYWNtQ2VydGlmaWNhdGVGb3JDdXN0b21Eb21haW4gPSBuZXcgYWNtLkRuc1ZhbGlkYXRlZENlcnRpZmljYXRlKHRoaXMsICdDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IGBhcGkuJHtjdXN0b21Eb21haW5OYW1lfWAsXG4gICAgICBob3N0ZWRab25lOiB6b25lLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKHpvbmUpLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBjdXN0b20gZG9tYWluXG4gICAgY29uc3QgY3VzdG9tRG9tYWluID0gbmV3IGFwaWdhdGV3YXkuRG9tYWluTmFtZSh0aGlzLCAnQ3VzdG9tRG9tYWluTmFtZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IGBhcGkuJHtjdXN0b21Eb21haW5OYW1lfWAsXG4gICAgICBjZXJ0aWZpY2F0ZTogYWNtQ2VydGlmaWNhdGVGb3JDdXN0b21Eb21haW4sXG4gICAgICBlbmRwb2ludFR5cGU6IGFwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMLFxuICAgICAgc2VjdXJpdHlQb2xpY3k6IGFwaWdhdGV3YXkuU2VjdXJpdHlQb2xpY3kuVExTXzFfMlxuICAgIH0pO1xuXG4gICAgLy8gVGhpcyBpcyB0aGUgQVBJIEdhdGV3YXkgd2hpY2ggdGhlbiBjYWxscyB0aGUgbGFtYmRhLlxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJBUElHYXRld2F5XCIsIHtcbiAgICAgIHJlc3RBcGlOYW1lOiBcIkdhcmRlbiBJT1QgU2VydmljZVwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiVGhpcyBzZXJ2aWNlIGlzIGZvciB0aGUgR2FyZGVuIElPVCBwcm9qZWN0LlwiLFxuICAgICAgZGVwbG95OiBmYWxzZSAvLyBjcmVhdGUgdGhlIGRlcGxveW1lbnQgYmVsb3dcbiAgICB9KTtcblxuICAgIC8vIEJ5IGRlZmF1bHQgQ0RLIGNyZWF0ZXMgYSBkZXBsb3ltZW50IGFuZCBhIFwicHJvZFwiIHN0YWdlLiAgVGhhdCBtZWFucyB0aGUgVVJMIGlzIHNvbWV0aGluZyBsaWtlXG4gICAgLy8gaHR0cHM6Ly8yejJvY2toNmc1LmV4ZWN1dGUtYXBpLmV1LXdlc3QtMi5hbWF6b25hd3MuY29tL3Byb2QvXG4gICAgLy8gV2Ugd2FudCB0byBjcmVhdGUgdGhlIHN0YWdlIHRvIG1hdGNoIHRoZSB2ZXJzaW9uIGlkLlxuICAgIC8vIFNlbWFudGljIHZlcnNpb25pbmcgaGFzIGRvdHMgYXMgc2VwYXJhdG9ycyBidXQgdGhpcyBpcyBpbnZhbGlkIGluIGEgVVJMXG4gICAgLy8gc28gcmVwbGFjZSB0aGUgZG90cyB3aXRoIHVuZGVyc2NvcmVzIGZpcnN0LlxuICAgIGNvbnN0IHZlcnNpb25JZEZvclVSTCA9IHZlcnNpb25JZC5yZXBsYWNlKC9cXC4vZywgJ18nKTtcbiAgICBjb25zdCBhcGlHYXRld2F5RGVwbG95bWVudCA9IG5ldyBhcGlnYXRld2F5LkRlcGxveW1lbnQodGhpcywgJ0FwaUdhdGV3YXlEZXBsb3ltZW50Jywge1xuICAgICAgYXBpOiBhcGlcbiAgICB9KTtcbiAgICBjb25zdCBzdGFnZSA9IG5ldyBhcGlnYXRld2F5LlN0YWdlKHRoaXMsICdTdGFnZScsIHtcbiAgICAgIGRlcGxveW1lbnQ6IGFwaUdhdGV3YXlEZXBsb3ltZW50LFxuICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgZGF0YVRyYWNlRW5hYmxlZDogdHJ1ZSxcbiAgICAgIHN0YWdlTmFtZTogdmVyc2lvbklkRm9yVVJMXG4gICAgfSlcblxuICAgIC8vIENvbm5lY3QgdGhlIEFQSSB0byB0aGUgbGFtYmRhc1xuICAgIGNvbnN0IHRlbXBlcmF0dXJlTGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0ZW1wZXJhdHVyZUxhbWJkYSwge1xuICAgICAgcmVxdWVzdFRlbXBsYXRlczogeyBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3sgXCJzdGF0dXNDb2RlXCI6IFwiMjAwXCIgfScgfVxuICAgIH0pO1xuICAgIGNvbnN0IHRlbXBlcmF0dXJlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgndGVtcGVyYXR1cmUnKTtcbiAgICB0ZW1wZXJhdHVyZVJlc291cmNlLmFkZE1ldGhvZChcIkdFVFwiLCB0ZW1wZXJhdHVyZUxhbWJkYUludGVncmF0aW9uKTtcblxuICAgIGNvbnN0IG1vaXN0dXJlTGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihtb2lzdHVyZUxhbWJkYSwge1xuICAgICAgcmVxdWVzdFRlbXBsYXRlczogeyBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3sgXCJzdGF0dXNDb2RlXCI6IFwiMjAwXCIgfScgfVxuICAgIH0pO1xuICAgIGNvbnN0IG1vaXN0dXJlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnbW9pc3R1cmUnKTtcbiAgICBtb2lzdHVyZVJlc291cmNlLmFkZE1ldGhvZChcIkdFVFwiLCBtb2lzdHVyZUxhbWJkYUludGVncmF0aW9uKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgUjUzIFwiQVwiIHJlY29yZCB0byBtYXAgZnJvbSB0aGUgY3VzdG9tIGRvbWFpbiB0byB0aGUgYWN0dWFsIEFQSSBVUkxcbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdDdXN0b21Eb21haW5BbGlhc1JlY29yZCcsIHtcbiAgICAgIHJlY29yZE5hbWU6IGBhcGkuJHtjdXN0b21Eb21haW5OYW1lfWAsXG4gICAgICB6b25lOiB6b25lLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMobmV3IHRhcmdldHMuQXBpR2F0ZXdheURvbWFpbihjdXN0b21Eb21haW4pKVxuICAgIH0pO1xuICAgIC8vIEFuZCBwYXRoIG1hcHBpbmcgdG8gdGhlIEFQSVxuICAgIGN1c3RvbURvbWFpbi5hZGRCYXNlUGF0aE1hcHBpbmcoYXBpLCB7IGJhc2VQYXRoOiBgJHt2ZXJzaW9uSWRGb3JVUkx9YCwgc3RhZ2U6IHN0YWdlIH0pO1xuXG4gIH1cbn1cbiJdfQ==