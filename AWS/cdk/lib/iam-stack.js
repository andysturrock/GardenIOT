"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IAMStack = void 0;
const cdk = require("aws-cdk-lib");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const common_1 = require("./common");
class IAMStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const policyStatementProps = {
            sid: 'AllowAutomationOperations',
            effect: aws_cdk_lib_1.aws_iam.Effect.ALLOW,
            actions: [
                'cloudformation:DescribeStacks',
                'cloudformation:GetTemplate',
                'cloudformation:DeleteStack',
                'cloudformation:DeleteChangeSet',
                'cloudformation:CreateChangeSet',
                'cloudformation:DescribeChangeSet',
                'cloudformation:ExecuteChangeSet',
                'cloudformation:DescribeStackEvents',
                'iam:CreateRole',
                'iam:DetachRolePolicy',
                'iam:AttachRolePolicy',
                'iam:DeleteRole',
                'iam:GetRole',
                'iam:PassRole',
                'iam:PutRolePolicy',
                'iam:GetRolePolicy',
                'iam:DeleteRolePolicy',
                'lambda:CreateFunction',
                'lambda:DeleteFunction',
                'lambda:GetFunctionConfiguration',
                'lambda:GetFunction',
                'lambda:AddPermission',
                'lambda:RemovePermission',
                'lambda:PublishLayerVersion',
                'lambda:DeleteLayerVersion',
                'lambda:UpdateFunctionCode',
                'lambda:InvokeFunction',
                'lambda:GetLayerVersion',
                'events:PutRule',
                'events:RemoveTargets',
                'events:DeleteRule',
                'events:DescribeRule',
                'events:PutTargets',
                'cloudfront:CreateDistribution',
                'cloudfront:TagResource',
                'cloudfront:GetDistribution',
                'cloudfront:UpdateDistribution',
                'cloudfront:DeleteDistribution',
                'cloudfront:CreateCloudFrontOriginAccessIdentity',
                'cloudfront:GetCloudFrontOriginAccessIdentity',
                'cloudfront:DeleteCloudFrontOriginAccessIdentity',
                'route53:GetHostedZone',
                'route53:ChangeResourceRecordSets',
                'route53:GetChange',
                'route53:ListResourceRecordSets',
                'dynamodb:CreateTable',
                'dynamodb:DescribeTable',
                'application-autoscaling:DescribeScalableTargets',
                'application-autoscaling:RegisterScalableTarget',
                'application-autoscaling:DeregisterScalableTarget',
                'application-autoscaling:DescribeScalingPolicies',
                'application-autoscaling:PutScalingPolicy',
                'application-autoscaling:DeleteScalingPolicy',
                's3:*' // TODO - make this least privilege.  Docs are hopeless for what you actually need.
            ],
            resources: ['*']
        };
        // Apply the policy to either a role or a group depending on what was specified
        const roleArn = common_1.getEnv('AWS_AUTOMATION_ROLE_ARN');
        if (roleArn) {
            const role = aws_cdk_lib_1.aws_iam.Role.fromRoleArn(this, "Role", roleArn);
            const policyStatement = new aws_cdk_lib_1.aws_iam.PolicyStatement(policyStatementProps);
            const policyProps = { roles: [role], statements: [policyStatement] };
            new aws_cdk_lib_1.aws_iam.Policy(this, "Policy", policyProps);
        }
        const groupArn = common_1.getEnv('AWS_AUTOMATION_GROUP_ARN');
        if (groupArn) {
            const group = aws_cdk_lib_1.aws_iam.Group.fromGroupArn(this, "Role", groupArn);
            const policyStatement = new aws_cdk_lib_1.aws_iam.PolicyStatement(policyStatementProps);
            const policyProps = { policyName: "AUTOMATION_policy", groups: [group], statements: [policyStatement] };
            new aws_cdk_lib_1.aws_iam.Policy(this, "Policy", policyProps);
        }
    }
}
exports.IAMStack = IAMStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWFtLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaWFtLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUFvQztBQUNwQyw2Q0FBNkM7QUFDN0MscUNBQWtDO0FBRWxDLE1BQWEsUUFBUyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxvQkFBb0IsR0FBNkI7WUFDckQsR0FBRyxFQUFFLDJCQUEyQjtZQUNoQyxNQUFNLEVBQUUscUJBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSztZQUN4QixPQUFPLEVBQUU7Z0JBQ1AsK0JBQStCO2dCQUMvQiw0QkFBNEI7Z0JBQzVCLDRCQUE0QjtnQkFDNUIsZ0NBQWdDO2dCQUNoQyxnQ0FBZ0M7Z0JBQ2hDLGtDQUFrQztnQkFDbEMsaUNBQWlDO2dCQUNqQyxvQ0FBb0M7Z0JBQ3BDLGdCQUFnQjtnQkFDaEIsc0JBQXNCO2dCQUN0QixzQkFBc0I7Z0JBQ3RCLGdCQUFnQjtnQkFDaEIsYUFBYTtnQkFDYixjQUFjO2dCQUNkLG1CQUFtQjtnQkFDbkIsbUJBQW1CO2dCQUNuQixzQkFBc0I7Z0JBQ3RCLHVCQUF1QjtnQkFDdkIsdUJBQXVCO2dCQUN2QixpQ0FBaUM7Z0JBQ2pDLG9CQUFvQjtnQkFDcEIsc0JBQXNCO2dCQUN0Qix5QkFBeUI7Z0JBQ3pCLDRCQUE0QjtnQkFDNUIsMkJBQTJCO2dCQUMzQiwyQkFBMkI7Z0JBQzNCLHVCQUF1QjtnQkFDdkIsd0JBQXdCO2dCQUN4QixnQkFBZ0I7Z0JBQ2hCLHNCQUFzQjtnQkFDdEIsbUJBQW1CO2dCQUNuQixxQkFBcUI7Z0JBQ3JCLG1CQUFtQjtnQkFDbkIsK0JBQStCO2dCQUMvQix3QkFBd0I7Z0JBQ3hCLDRCQUE0QjtnQkFDNUIsK0JBQStCO2dCQUMvQiwrQkFBK0I7Z0JBQy9CLGlEQUFpRDtnQkFDakQsOENBQThDO2dCQUM5QyxpREFBaUQ7Z0JBQ2pELHVCQUF1QjtnQkFDdkIsa0NBQWtDO2dCQUNsQyxtQkFBbUI7Z0JBQ25CLGdDQUFnQztnQkFDaEMsc0JBQXNCO2dCQUN0Qix3QkFBd0I7Z0JBQ3hCLGlEQUFpRDtnQkFDakQsZ0RBQWdEO2dCQUNoRCxrREFBa0Q7Z0JBQ2xELGlEQUFpRDtnQkFDakQsMENBQTBDO2dCQUMxQyw2Q0FBNkM7Z0JBQzdDLE1BQU0sQ0FBQyxtRkFBbUY7YUFDM0Y7WUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDakIsQ0FBQztRQUVGLCtFQUErRTtRQUMvRSxNQUFNLE9BQU8sR0FBRyxlQUFNLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNsRCxJQUFHLE9BQU8sRUFBRTtZQUNWLE1BQU0sSUFBSSxHQUFHLHFCQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLE9BQVEsQ0FBQyxDQUFDO1lBQzFELE1BQU0sZUFBZSxHQUFHLElBQUkscUJBQUcsQ0FBQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsQ0FBQTtZQUNyRSxNQUFNLFdBQVcsR0FBRyxFQUFDLEtBQUssRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFDLENBQUM7WUFDbkUsSUFBSSxxQkFBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1NBQzdDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsZUFBTSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDcEQsSUFBRyxRQUFRLEVBQUU7WUFDWCxNQUFNLEtBQUssR0FBRyxxQkFBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFTLENBQUMsQ0FBQztZQUM5RCxNQUFNLGVBQWUsR0FBRyxJQUFJLHFCQUFHLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLENBQUE7WUFDckUsTUFBTSxXQUFXLEdBQUcsRUFBQyxVQUFVLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQUMsQ0FBQztZQUN0RyxJQUFJLHFCQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7U0FDN0M7SUFDSCxDQUFDO0NBQ0Y7QUFsRkQsNEJBa0ZDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCAqIGFzIGNkayAgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBhd3NfaWFtIGFzIGlhbSB9IGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgZ2V0RW52IH0gZnJvbSAnLi9jb21tb24nO1xyXG5cclxuZXhwb3J0IGNsYXNzIElBTVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICBjb25zdCBwb2xpY3lTdGF0ZW1lbnRQcm9wczogaWFtLlBvbGljeVN0YXRlbWVudFByb3BzID0ge1xyXG4gICAgICBzaWQ6ICdBbGxvd0F1dG9tYXRpb25PcGVyYXRpb25zJyxcclxuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcclxuICAgICAgICAnY2xvdWRmb3JtYXRpb246R2V0VGVtcGxhdGUnLFxyXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZWxldGVTdGFjaycsXHJcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlbGV0ZUNoYW5nZVNldCcsXHJcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkNyZWF0ZUNoYW5nZVNldCcsXHJcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlQ2hhbmdlU2V0JyxcclxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RXhlY3V0ZUNoYW5nZVNldCcsXHJcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tFdmVudHMnLFxyXG4gICAgICAgICdpYW06Q3JlYXRlUm9sZScsXHJcbiAgICAgICAgJ2lhbTpEZXRhY2hSb2xlUG9saWN5JyxcclxuICAgICAgICAnaWFtOkF0dGFjaFJvbGVQb2xpY3knLFxyXG4gICAgICAgICdpYW06RGVsZXRlUm9sZScsXHJcbiAgICAgICAgJ2lhbTpHZXRSb2xlJyxcclxuICAgICAgICAnaWFtOlBhc3NSb2xlJyxcclxuICAgICAgICAnaWFtOlB1dFJvbGVQb2xpY3knLFxyXG4gICAgICAgICdpYW06R2V0Um9sZVBvbGljeScsXHJcbiAgICAgICAgJ2lhbTpEZWxldGVSb2xlUG9saWN5JyxcclxuICAgICAgICAnbGFtYmRhOkNyZWF0ZUZ1bmN0aW9uJyxcclxuICAgICAgICAnbGFtYmRhOkRlbGV0ZUZ1bmN0aW9uJyxcclxuICAgICAgICAnbGFtYmRhOkdldEZ1bmN0aW9uQ29uZmlndXJhdGlvbicsXHJcbiAgICAgICAgJ2xhbWJkYTpHZXRGdW5jdGlvbicsXHJcbiAgICAgICAgJ2xhbWJkYTpBZGRQZXJtaXNzaW9uJyxcclxuICAgICAgICAnbGFtYmRhOlJlbW92ZVBlcm1pc3Npb24nLFxyXG4gICAgICAgICdsYW1iZGE6UHVibGlzaExheWVyVmVyc2lvbicsXHJcbiAgICAgICAgJ2xhbWJkYTpEZWxldGVMYXllclZlcnNpb24nLFxyXG4gICAgICAgICdsYW1iZGE6VXBkYXRlRnVuY3Rpb25Db2RlJyxcclxuICAgICAgICAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcclxuICAgICAgICAnbGFtYmRhOkdldExheWVyVmVyc2lvbicsXHJcbiAgICAgICAgJ2V2ZW50czpQdXRSdWxlJyxcclxuICAgICAgICAnZXZlbnRzOlJlbW92ZVRhcmdldHMnLFxyXG4gICAgICAgICdldmVudHM6RGVsZXRlUnVsZScsXHJcbiAgICAgICAgJ2V2ZW50czpEZXNjcmliZVJ1bGUnLFxyXG4gICAgICAgICdldmVudHM6UHV0VGFyZ2V0cycsXHJcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6Q3JlYXRlRGlzdHJpYnV0aW9uJyxcclxuICAgICAgICAnY2xvdWRmcm9udDpUYWdSZXNvdXJjZScsXHJcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6R2V0RGlzdHJpYnV0aW9uJyxcclxuICAgICAgICAnY2xvdWRmcm9udDpVcGRhdGVEaXN0cmlidXRpb24nLFxyXG4gICAgICAgICdjbG91ZGZyb250OkRlbGV0ZURpc3RyaWJ1dGlvbicsXHJcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6Q3JlYXRlQ2xvdWRGcm9udE9yaWdpbkFjY2Vzc0lkZW50aXR5JyxcclxuICAgICAgICAnY2xvdWRmcm9udDpHZXRDbG91ZEZyb250T3JpZ2luQWNjZXNzSWRlbnRpdHknLFxyXG4gICAgICAgICdjbG91ZGZyb250OkRlbGV0ZUNsb3VkRnJvbnRPcmlnaW5BY2Nlc3NJZGVudGl0eScsXHJcbiAgICAgICAgJ3JvdXRlNTM6R2V0SG9zdGVkWm9uZScsXHJcbiAgICAgICAgJ3JvdXRlNTM6Q2hhbmdlUmVzb3VyY2VSZWNvcmRTZXRzJyxcclxuICAgICAgICAncm91dGU1MzpHZXRDaGFuZ2UnLFxyXG4gICAgICAgICdyb3V0ZTUzOkxpc3RSZXNvdXJjZVJlY29yZFNldHMnLFxyXG4gICAgICAgICdkeW5hbW9kYjpDcmVhdGVUYWJsZScsXHJcbiAgICAgICAgJ2R5bmFtb2RiOkRlc2NyaWJlVGFibGUnLFxyXG4gICAgICAgICdhcHBsaWNhdGlvbi1hdXRvc2NhbGluZzpEZXNjcmliZVNjYWxhYmxlVGFyZ2V0cycsXHJcbiAgICAgICAgJ2FwcGxpY2F0aW9uLWF1dG9zY2FsaW5nOlJlZ2lzdGVyU2NhbGFibGVUYXJnZXQnLFxyXG4gICAgICAgICdhcHBsaWNhdGlvbi1hdXRvc2NhbGluZzpEZXJlZ2lzdGVyU2NhbGFibGVUYXJnZXQnLFxyXG4gICAgICAgICdhcHBsaWNhdGlvbi1hdXRvc2NhbGluZzpEZXNjcmliZVNjYWxpbmdQb2xpY2llcycsXHJcbiAgICAgICAgJ2FwcGxpY2F0aW9uLWF1dG9zY2FsaW5nOlB1dFNjYWxpbmdQb2xpY3knLFxyXG4gICAgICAgICdhcHBsaWNhdGlvbi1hdXRvc2NhbGluZzpEZWxldGVTY2FsaW5nUG9saWN5JyxcclxuICAgICAgICAnczM6KicgLy8gVE9ETyAtIG1ha2UgdGhpcyBsZWFzdCBwcml2aWxlZ2UuICBEb2NzIGFyZSBob3BlbGVzcyBmb3Igd2hhdCB5b3UgYWN0dWFsbHkgbmVlZC5cclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbJyonXVxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBBcHBseSB0aGUgcG9saWN5IHRvIGVpdGhlciBhIHJvbGUgb3IgYSBncm91cCBkZXBlbmRpbmcgb24gd2hhdCB3YXMgc3BlY2lmaWVkXHJcbiAgICBjb25zdCByb2xlQXJuID0gZ2V0RW52KCdBV1NfQVVUT01BVElPTl9ST0xFX0FSTicpO1xyXG4gICAgaWYocm9sZUFybikge1xyXG4gICAgICBjb25zdCByb2xlID0gaWFtLlJvbGUuZnJvbVJvbGVBcm4odGhpcywgXCJSb2xlXCIsIHJvbGVBcm4hKTtcclxuICAgICAgY29uc3QgcG9saWN5U3RhdGVtZW50ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQocG9saWN5U3RhdGVtZW50UHJvcHMpXHJcbiAgICAgIGNvbnN0IHBvbGljeVByb3BzID0ge3JvbGVzOiBbcm9sZV0sIHN0YXRlbWVudHM6IFtwb2xpY3lTdGF0ZW1lbnRdfTtcclxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJQb2xpY3lcIiwgcG9saWN5UHJvcHMpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgZ3JvdXBBcm4gPSBnZXRFbnYoJ0FXU19BVVRPTUFUSU9OX0dST1VQX0FSTicpO1xyXG4gICAgaWYoZ3JvdXBBcm4pIHtcclxuICAgICAgY29uc3QgZ3JvdXAgPSBpYW0uR3JvdXAuZnJvbUdyb3VwQXJuKHRoaXMsIFwiUm9sZVwiLCBncm91cEFybiEpO1xyXG4gICAgICBjb25zdCBwb2xpY3lTdGF0ZW1lbnQgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudChwb2xpY3lTdGF0ZW1lbnRQcm9wcylcclxuICAgICAgY29uc3QgcG9saWN5UHJvcHMgPSB7cG9saWN5TmFtZTogXCJBVVRPTUFUSU9OX3BvbGljeVwiLCBncm91cHM6IFtncm91cF0sIHN0YXRlbWVudHM6IFtwb2xpY3lTdGF0ZW1lbnRdfTtcclxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJQb2xpY3lcIiwgcG9saWN5UHJvcHMpO1xyXG4gICAgfVxyXG4gIH1cclxufVxyXG4iXX0=