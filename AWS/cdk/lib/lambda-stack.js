"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaStack = void 0;
const cdk = require("aws-cdk-lib");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const aws_cdk_lib_2 = require("aws-cdk-lib");
const aws_cdk_lib_3 = require("aws-cdk-lib");
const aws_cdk_lib_4 = require("aws-cdk-lib");
const aws_cdk_lib_5 = require("aws-cdk-lib");
const aws_cdk_lib_6 = require("aws-cdk-lib");
const common_1 = require("./common");
class LambdaStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a;
        super(scope, id, props);
        const policyArn = common_1.getEnv('AWS_BOUNDARY_POLICY_ARN');
        if (policyArn) {
            const boundary = aws_cdk_lib_1.aws_iam.ManagedPolicy.fromManagedPolicyArn(this, 'Boundary', policyArn);
            aws_cdk_lib_1.aws_iam.PermissionsBoundary.of(this).apply(boundary);
        }
        // Create the temperature lambdas
        const temperatureGetLambda = new aws_cdk_lib_4.aws_lambda.Function(this, "TemperatureGetLambda", {
            runtime: aws_cdk_lib_4.aws_lambda.Runtime.NODEJS_14_X,
            code: aws_cdk_lib_4.aws_lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
            handler: "temperature_get.lambdaHandler"
        });
        const temperaturePostLambda = new aws_cdk_lib_4.aws_lambda.Function(this, "TemperaturePostLambda", {
            runtime: aws_cdk_lib_4.aws_lambda.Runtime.NODEJS_14_X,
            code: aws_cdk_lib_4.aws_lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
            handler: "temperature_post.lambdaHandler"
        });
        // And the moisture lambda
        const moistureGetLambda = new aws_cdk_lib_4.aws_lambda.Function(this, "MoistureGetLambda", {
            runtime: aws_cdk_lib_4.aws_lambda.Runtime.NODEJS_14_X,
            code: aws_cdk_lib_4.aws_lambda.Code.fromAsset("../lambda-code/dist/lambda.zip"),
            handler: "moisture_get.lambdaHandler"
        });
        // Allow it access to SecretsManager.  Strangely there is no Read-only managed policy.
        const secretsManagerReadPolicy = aws_cdk_lib_1.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite");
        (_a = temperatureGetLambda.role) === null || _a === void 0 ? void 0 : _a.addManagedPolicy(secretsManagerReadPolicy);
        // Allow the Lambdas appropriate access to the DyanamoDB tables
        props.temperatureHistoryTable.grantReadData(temperatureGetLambda);
        props.temperatureHistoryTable.grantReadWriteData(temperaturePostLambda);
        props.lastSensorReadingTable.grantReadData(temperatureGetLambda);
        props.lastSensorReadingTable.grantReadWriteData(temperaturePostLambda);
        const customDomainName = common_1.getEnv('CUSTOM_DOMAIN_NAME');
        const r53ZoneId = common_1.getEnv('R53_ZONE_ID');
        const lambdaVersion = common_1.getEnv('LAMBDA_VERSION');
        // Get hold of the hosted zone which has previously been created
        const zone = aws_cdk_lib_2.aws_route53.HostedZone.fromHostedZoneAttributes(this, 'R53Zone', {
            zoneName: customDomainName,
            hostedZoneId: r53ZoneId,
        });
        // Create the cert for the gateway.
        // Usefully, this writes the DNS Validation CNAME records to the R53 zone,
        // which is great as normal Cloudformation doesn't do that.
        const acmCertificateForCustomDomain = new aws_cdk_lib_5.aws_certificatemanager.DnsValidatedCertificate(this, 'Certificate', {
            domainName: `api.${customDomainName}`,
            hostedZone: zone,
            validation: aws_cdk_lib_5.aws_certificatemanager.CertificateValidation.fromDns(zone),
        });
        // Create the custom domain
        const customDomain = new aws_cdk_lib_6.aws_apigateway.DomainName(this, 'CustomDomainName', {
            domainName: `api.${customDomainName}`,
            certificate: acmCertificateForCustomDomain,
            endpointType: aws_cdk_lib_6.aws_apigateway.EndpointType.REGIONAL,
            securityPolicy: aws_cdk_lib_6.aws_apigateway.SecurityPolicy.TLS_1_2
        });
        // This is the API Gateway which then calls the lambda.
        const api = new aws_cdk_lib_6.aws_apigateway.RestApi(this, "APIGateway", {
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
        const apiGatewayDeployment = new aws_cdk_lib_6.aws_apigateway.Deployment(this, 'ApiGatewayDeployment', {
            api: api
        });
        const stage = new aws_cdk_lib_6.aws_apigateway.Stage(this, 'Stage', {
            deployment: apiGatewayDeployment,
            loggingLevel: aws_cdk_lib_6.aws_apigateway.MethodLoggingLevel.INFO,
            dataTraceEnabled: true,
            stageName: versionIdForURL
        });
        // Connect the API to the lambdas
        const temperatureGetLambdaIntegration = new aws_cdk_lib_6.aws_apigateway.LambdaIntegration(temperatureGetLambda, {
            requestTemplates: { "application/json": '{ "statusCode": "200" }' }
        });
        const temperaturePostLambdaIntegration = new aws_cdk_lib_6.aws_apigateway.LambdaIntegration(temperaturePostLambda, {
            requestTemplates: { "application/json": '{ "statusCode": "200" }' }
        });
        const temperatureResource = api.root.addResource('temperature');
        temperatureResource.addMethod("GET", temperatureGetLambdaIntegration);
        temperatureResource.addMethod("POST", temperaturePostLambdaIntegration);
        const moistureGetLambdaIntegration = new aws_cdk_lib_6.aws_apigateway.LambdaIntegration(moistureGetLambda, {
            requestTemplates: { "application/json": '{ "statusCode": "200" }' }
        });
        const moistureResource = api.root.addResource('moisture');
        moistureResource.addMethod("GET", moistureGetLambdaIntegration);
        // Create the R53 "A" record to map from the custom domain to the actual API URL
        new aws_cdk_lib_2.aws_route53.ARecord(this, 'CustomDomainAliasRecord', {
            recordName: `api.${customDomainName}`,
            zone: zone,
            target: aws_cdk_lib_2.aws_route53.RecordTarget.fromAlias(new aws_cdk_lib_3.aws_route53_targets.ApiGatewayDomain(customDomain))
        });
        // And path mapping to the API
        customDomain.addBasePathMapping(api, { basePath: `${versionIdForURL}`, stage: stage });
    }
}
exports.LambdaStack = LambdaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFtYmRhLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibGFtYmRhLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUFtQztBQUNuQyw2Q0FBNkM7QUFDN0MsNkNBQXFEO0FBQ3JELDZDQUE2RDtBQUM3RCw2Q0FBbUQ7QUFDbkQsNkNBQTREO0FBQzVELDZDQUEyRDtBQUMzRCxxQ0FBb0Q7QUFFcEQsTUFBYSxXQUFZLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF1Qjs7UUFDL0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxTQUFTLEdBQUcsZUFBTSxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDcEQsSUFBRyxTQUFTLEVBQUU7WUFDWixNQUFNLFFBQVEsR0FBRyxxQkFBRyxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3JGLHFCQUFHLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUNsRDtRQUVELGlDQUFpQztRQUNqQyxNQUFNLG9CQUFvQixHQUFHLElBQUksd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzdFLE9BQU8sRUFBRSx3QkFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLElBQUksRUFBRSx3QkFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsZ0NBQWdDLENBQUM7WUFDN0QsT0FBTyxFQUFFLCtCQUErQjtTQUN6QyxDQUFDLENBQUM7UUFFSCxNQUFNLHFCQUFxQixHQUFHLElBQUksd0JBQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9FLE9BQU8sRUFBRSx3QkFBTSxDQUFD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Q0FBQyxVQUFVLENBQUMsQ0FBQztRQUMxRCxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFFaEUsZ0ZBQWdGO1FBQ2hGLElBQUkseUJBQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ25ELFVBQVUsRUFBRSxPQUFPLGdCQUFnQixFQUFFO1lBQ3JDLElBQUksRUFBRSxJQUFJO1lBQ1YsTUFBTSxFQUFFLHlCQUFPLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlDQUFPLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLENBQUM7U0FDbkYsQ0FBQyxDQUFDO1FBQ0gsOEJBQThCO1FBQzlCLFlBQVksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsRUFBRSxRQUFRLEVBQUUsR0FBRyxlQUFlLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN6RixDQUFDO0NBQ0Y7QUFwSEQsa0NBb0hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IGF3c19pYW0gYXMgaWFtIH0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBhd3Nfcm91dGU1MyBhcyByb3V0ZTUzIH0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBhd3Nfcm91dGU1M190YXJnZXRzIGFzIHRhcmdldHMgfSBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCB7IGF3c19sYW1iZGEgYXMgbGFtYmRhIH0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBhd3NfY2VydGlmaWNhdGVtYW5hZ2VyIGFzIGFjbSB9IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgYXdzX2FwaWdhdGV3YXkgYXMgYXBpZ2F0ZXdheSB9IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgZ2V0RW52LCBMYW1iZGFTdGFja1Byb3BzIH0gZnJvbSAnLi9jb21tb24nO1xyXG5cclxuZXhwb3J0IGNsYXNzIExhbWJkYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTGFtYmRhU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgY29uc3QgcG9saWN5QXJuID0gZ2V0RW52KCdBV1NfQk9VTkRBUllfUE9MSUNZX0FSTicpO1xyXG4gICAgaWYocG9saWN5QXJuKSB7XHJcbiAgICAgIGNvbnN0IGJvdW5kYXJ5ID0gaWFtLk1hbmFnZWRQb2xpY3kuZnJvbU1hbmFnZWRQb2xpY3lBcm4odGhpcywgJ0JvdW5kYXJ5JywgcG9saWN5QXJuKTtcclxuICAgICAgaWFtLlBlcm1pc3Npb25zQm91bmRhcnkub2YodGhpcykuYXBwbHkoYm91bmRhcnkpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgdGVtcGVyYXR1cmUgbGFtYmRhc1xyXG4gICAgY29uc3QgdGVtcGVyYXR1cmVHZXRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiVGVtcGVyYXR1cmVHZXRMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiLi4vbGFtYmRhLWNvZGUvZGlzdC9sYW1iZGEuemlwXCIpLFxyXG4gICAgICBoYW5kbGVyOiBcInRlbXBlcmF0dXJlX2dldC5sYW1iZGFIYW5kbGVyXCJcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHRlbXBlcmF0dXJlUG9zdExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJUZW1wZXJhdHVyZVBvc3RMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiLi4vbGFtYmRhLWNvZGUvZGlzdC9sYW1iZGEuemlwXCIpLFxyXG4gICAgICBoYW5kbGVyOiBcInRlbXBlcmF0dXJlX3Bvc3QubGFtYmRhSGFuZGxlclwiXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBbmQgdGhlIG1vaXN0dXJlIGxhbWJkYVxyXG4gICAgY29uc3QgbW9pc3R1cmVHZXRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiTW9pc3R1cmVHZXRMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMTRfWCxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiLi4vbGFtYmRhLWNvZGUvZGlzdC9sYW1iZGEuemlwXCIpLFxyXG4gICAgICBoYW5kbGVyOiBcIm1vaXN0dXJlX2dldC5sYW1iZGFIYW5kbGVyXCJcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFsbG93IGl0IGFjY2VzcyB0byBTZWNyZXRzTWFuYWdlci4gIFN0cmFuZ2VseSB0aGVyZSBpcyBubyBSZWFkLW9ubHkgbWFuYWdlZCBwb2xpY3kuXHJcbiAgICBjb25zdCBzZWNyZXRzTWFuYWdlclJlYWRQb2xpY3kgPSBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXCJTZWNyZXRzTWFuYWdlclJlYWRXcml0ZVwiKTtcclxuICAgIHRlbXBlcmF0dXJlR2V0TGFtYmRhLnJvbGU/LmFkZE1hbmFnZWRQb2xpY3koc2VjcmV0c01hbmFnZXJSZWFkUG9saWN5KTtcclxuXHJcbiAgICAvLyBBbGxvdyB0aGUgTGFtYmRhcyBhcHByb3ByaWF0ZSBhY2Nlc3MgdG8gdGhlIER5YW5hbW9EQiB0YWJsZXNcclxuICAgIHByb3BzLnRlbXBlcmF0dXJlSGlzdG9yeVRhYmxlLmdyYW50UmVhZERhdGEodGVtcGVyYXR1cmVHZXRMYW1iZGEpO1xyXG4gICAgcHJvcHMudGVtcGVyYXR1cmVIaXN0b3J5VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKHRlbXBlcmF0dXJlUG9zdExhbWJkYSk7XHJcbiAgICBwcm9wcy5sYXN0U2Vuc29yUmVhZGluZ1RhYmxlLmdyYW50UmVhZERhdGEodGVtcGVyYXR1cmVHZXRMYW1iZGEpO1xyXG4gICAgcHJvcHMubGFzdFNlbnNvclJlYWRpbmdUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEodGVtcGVyYXR1cmVQb3N0TGFtYmRhKTtcclxuXHJcbiAgICBjb25zdCBjdXN0b21Eb21haW5OYW1lID0gZ2V0RW52KCdDVVNUT01fRE9NQUlOX05BTUUnKSE7XHJcbiAgICBjb25zdCByNTNab25lSWQgPSBnZXRFbnYoJ1I1M19aT05FX0lEJykhO1xyXG4gICAgY29uc3QgbGFtYmRhVmVyc2lvbiA9IGdldEVudignTEFNQkRBX1ZFUlNJT04nKSE7XHJcblxyXG4gICAgLy8gR2V0IGhvbGQgb2YgdGhlIGhvc3RlZCB6b25lIHdoaWNoIGhhcyBwcmV2aW91c2x5IGJlZW4gY3JlYXRlZFxyXG4gICAgY29uc3Qgem9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ1I1M1pvbmUnLCB7XHJcbiAgICAgIHpvbmVOYW1lOiBjdXN0b21Eb21haW5OYW1lLFxyXG4gICAgICBob3N0ZWRab25lSWQ6IHI1M1pvbmVJZCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgY2VydCBmb3IgdGhlIGdhdGV3YXkuXHJcbiAgICAvLyBVc2VmdWxseSwgdGhpcyB3cml0ZXMgdGhlIEROUyBWYWxpZGF0aW9uIENOQU1FIHJlY29yZHMgdG8gdGhlIFI1MyB6b25lLFxyXG4gICAgLy8gd2hpY2ggaXMgZ3JlYXQgYXMgbm9ybWFsIENsb3VkZm9ybWF0aW9uIGRvZXNuJ3QgZG8gdGhhdC5cclxuICAgIGNvbnN0IGFjbUNlcnRpZmljYXRlRm9yQ3VzdG9tRG9tYWluID0gbmV3IGFjbS5EbnNWYWxpZGF0ZWRDZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XHJcbiAgICAgIGRvbWFpbk5hbWU6IGBhcGkuJHtjdXN0b21Eb21haW5OYW1lfWAsXHJcbiAgICAgIGhvc3RlZFpvbmU6IHpvbmUsXHJcbiAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyh6b25lKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgY3VzdG9tIGRvbWFpblxyXG4gICAgY29uc3QgY3VzdG9tRG9tYWluID0gbmV3IGFwaWdhdGV3YXkuRG9tYWluTmFtZSh0aGlzLCAnQ3VzdG9tRG9tYWluTmFtZScsIHtcclxuICAgICAgZG9tYWluTmFtZTogYGFwaS4ke2N1c3RvbURvbWFpbk5hbWV9YCxcclxuICAgICAgY2VydGlmaWNhdGU6IGFjbUNlcnRpZmljYXRlRm9yQ3VzdG9tRG9tYWluLFxyXG4gICAgICBlbmRwb2ludFR5cGU6IGFwaWdhdGV3YXkuRW5kcG9pbnRUeXBlLlJFR0lPTkFMLFxyXG4gICAgICBzZWN1cml0eVBvbGljeTogYXBpZ2F0ZXdheS5TZWN1cml0eVBvbGljeS5UTFNfMV8yXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUaGlzIGlzIHRoZSBBUEkgR2F0ZXdheSB3aGljaCB0aGVuIGNhbGxzIHRoZSBsYW1iZGEuXHJcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiQVBJR2F0ZXdheVwiLCB7XHJcbiAgICAgIHJlc3RBcGlOYW1lOiBcIkdhcmRlbiBJT1QgU2VydmljZVwiLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJUaGlzIHNlcnZpY2UgaXMgZm9yIHRoZSBHYXJkZW4gSU9UIHByb2plY3QuXCIsXHJcbiAgICAgIGRlcGxveTogZmFsc2UgLy8gY3JlYXRlIHRoZSBkZXBsb3ltZW50IGJlbG93XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBCeSBkZWZhdWx0IENESyBjcmVhdGVzIGEgZGVwbG95bWVudCBhbmQgYSBcInByb2RcIiBzdGFnZS4gIFRoYXQgbWVhbnMgdGhlIFVSTCBpcyBzb21ldGhpbmcgbGlrZVxyXG4gICAgLy8gaHR0cHM6Ly8yejJvY2toNmc1LmV4ZWN1dGUtYXBpLmV1LXdlc3QtMi5hbWF6b25hd3MuY29tL3Byb2QvXHJcbiAgICAvLyBXZSB3YW50IHRvIGNyZWF0ZSB0aGUgc3RhZ2UgdG8gbWF0Y2ggdGhlIHZlcnNpb24gaWQuXHJcbiAgICAvLyBTZW1hbnRpYyB2ZXJzaW9uaW5nIGhhcyBkb3RzIGFzIHNlcGFyYXRvcnMgYnV0IHRoaXMgaXMgaW52YWxpZCBpbiBhIFVSTFxyXG4gICAgLy8gc28gcmVwbGFjZSB0aGUgZG90cyB3aXRoIHVuZGVyc2NvcmVzIGZpcnN0LlxyXG4gICAgY29uc3QgdmVyc2lvbklkRm9yVVJMID0gbGFtYmRhVmVyc2lvbi5yZXBsYWNlKC9cXC4vZywgJ18nKTtcclxuICAgIGNvbnN0IGFwaUdhdGV3YXlEZXBsb3ltZW50ID0gbmV3IGFwaWdhdGV3YXkuRGVwbG95bWVudCh0aGlzLCAnQXBpR2F0ZXdheURlcGxveW1lbnQnLCB7XHJcbiAgICAgIGFwaTogYXBpXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IHN0YWdlID0gbmV3IGFwaWdhdGV3YXkuU3RhZ2UodGhpcywgJ1N0YWdlJywge1xyXG4gICAgICBkZXBsb3ltZW50OiBhcGlHYXRld2F5RGVwbG95bWVudCxcclxuICAgICAgbG9nZ2luZ0xldmVsOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxyXG4gICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzdGFnZU5hbWU6IHZlcnNpb25JZEZvclVSTFxyXG4gICAgfSlcclxuXHJcbiAgICAvLyBDb25uZWN0IHRoZSBBUEkgdG8gdGhlIGxhbWJkYXNcclxuICAgIGNvbnN0IHRlbXBlcmF0dXJlR2V0TGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0ZW1wZXJhdHVyZUdldExhbWJkYSwge1xyXG4gICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7IFwiYXBwbGljYXRpb24vanNvblwiOiAneyBcInN0YXR1c0NvZGVcIjogXCIyMDBcIiB9JyB9XHJcbiAgICB9KTtcclxuICAgIGNvbnN0IHRlbXBlcmF0dXJlUG9zdExhbWJkYUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGVtcGVyYXR1cmVQb3N0TGFtYmRhLCB7XHJcbiAgICAgIHJlcXVlc3RUZW1wbGF0ZXM6IHsgXCJhcHBsaWNhdGlvbi9qc29uXCI6ICd7IFwic3RhdHVzQ29kZVwiOiBcIjIwMFwiIH0nIH1cclxuICAgIH0pO1xyXG4gICAgY29uc3QgdGVtcGVyYXR1cmVSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKCd0ZW1wZXJhdHVyZScpO1xyXG4gICAgdGVtcGVyYXR1cmVSZXNvdXJjZS5hZGRNZXRob2QoXCJHRVRcIiwgdGVtcGVyYXR1cmVHZXRMYW1iZGFJbnRlZ3JhdGlvbik7XHJcbiAgICB0ZW1wZXJhdHVyZVJlc291cmNlLmFkZE1ldGhvZChcIlBPU1RcIiwgdGVtcGVyYXR1cmVQb3N0TGFtYmRhSW50ZWdyYXRpb24pO1xyXG5cclxuICAgIGNvbnN0IG1vaXN0dXJlR2V0TGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihtb2lzdHVyZUdldExhbWJkYSwge1xyXG4gICAgICByZXF1ZXN0VGVtcGxhdGVzOiB7IFwiYXBwbGljYXRpb24vanNvblwiOiAneyBcInN0YXR1c0NvZGVcIjogXCIyMDBcIiB9JyB9XHJcbiAgICB9KTtcclxuICAgIGNvbnN0IG1vaXN0dXJlUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZSgnbW9pc3R1cmUnKTtcclxuICAgIG1vaXN0dXJlUmVzb3VyY2UuYWRkTWV0aG9kKFwiR0VUXCIsIG1vaXN0dXJlR2V0TGFtYmRhSW50ZWdyYXRpb24pO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgUjUzIFwiQVwiIHJlY29yZCB0byBtYXAgZnJvbSB0aGUgY3VzdG9tIGRvbWFpbiB0byB0aGUgYWN0dWFsIEFQSSBVUkxcclxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ0N1c3RvbURvbWFpbkFsaWFzUmVjb3JkJywge1xyXG4gICAgICByZWNvcmROYW1lOiBgYXBpLiR7Y3VzdG9tRG9tYWluTmFtZX1gLFxyXG4gICAgICB6b25lOiB6b25lLFxyXG4gICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhuZXcgdGFyZ2V0cy5BcGlHYXRld2F5RG9tYWluKGN1c3RvbURvbWFpbikpXHJcbiAgICB9KTtcclxuICAgIC8vIEFuZCBwYXRoIG1hcHBpbmcgdG8gdGhlIEFQSVxyXG4gICAgY3VzdG9tRG9tYWluLmFkZEJhc2VQYXRoTWFwcGluZyhhcGksIHsgYmFzZVBhdGg6IGAke3ZlcnNpb25JZEZvclVSTH1gLCBzdGFnZTogc3RhZ2UgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==