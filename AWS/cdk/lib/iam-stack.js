"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IAMStack = void 0;
const cdk = require("@aws-cdk/core");
const iam = require("@aws-cdk/aws-iam");
const common_1 = require("./common");
class IAMStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const policyStatementProps = {
            sid: 'AllowAutomationOperations',
            effect: iam.Effect.ALLOW,
            actions: [
                'cloudformation:DescribeStacks',
                'cloudformation:GetTemplate',
                'cloudformation:DeleteStack',
                'cloudformation:DeleteChangeSet',
                'cloudformation:CreateChangeSet',
                'cloudformation:DescribeChangeSet',
                'cloudformation:ExecuteChangeSet',
                'cloudformation:DescribeStackEvents',
                's3:*',
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
                'route53:GetChangeRequest',
                'route53:ListResourceRecordSets'
            ],
            resources: ['*']
        };
        // Apply the policy to either a role or a group depending on what was specified
        const roleArn = common_1.default('AWS_AUTOMATION_ROLE_ARN');
        if (roleArn) {
            const role = iam.Role.fromRoleArn(this, "Role", roleArn);
            const policyStatement = new iam.PolicyStatement(policyStatementProps);
            const policyProps = { roles: [role], statements: [policyStatement] };
            new iam.Policy(this, "Policy", policyProps);
        }
        const groupArn = common_1.default('AWS_AUTOMATION_GROUP_ARN');
        if (groupArn) {
            const group = iam.Group.fromGroupArn(this, "Role", groupArn);
            const policyStatement = new iam.PolicyStatement(policyStatementProps);
            const policyProps = { group: [group], statements: [policyStatement] };
            new iam.Policy(this, "Policy", policyProps);
        }
    }
}
exports.IAMStack = IAMStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWFtLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaWFtLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHFDQUFxQztBQUNyQyx3Q0FBd0M7QUFDeEMscUNBQThCO0FBRTlCLE1BQWEsUUFBUyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JDLFlBQVksS0FBb0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxvQkFBb0IsR0FBNkI7WUFDckQsR0FBRyxFQUFFLDJCQUEyQjtZQUNoQyxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRTtnQkFDUCwrQkFBK0I7Z0JBQy9CLDRCQUE0QjtnQkFDNUIsNEJBQTRCO2dCQUM1QixnQ0FBZ0M7Z0JBQ2hDLGdDQUFnQztnQkFDaEMsa0NBQWtDO2dCQUNsQyxpQ0FBaUM7Z0JBQ2pDLG9DQUFvQztnQkFDcEMsTUFBTTtnQkFDTixnQkFBZ0I7Z0JBQ2hCLHNCQUFzQjtnQkFDdEIsc0JBQXNCO2dCQUN0QixnQkFBZ0I7Z0JBQ2hCLGFBQWE7Z0JBQ2IsY0FBYztnQkFDZCxtQkFBbUI7Z0JBQ25CLG1CQUFtQjtnQkFDbkIsc0JBQXNCO2dCQUN0Qix1QkFBdUI7Z0JBQ3ZCLHVCQUF1QjtnQkFDdkIsaUNBQWlDO2dCQUNqQyxvQkFBb0I7Z0JBQ3BCLHNCQUFzQjtnQkFDdEIseUJBQXlCO2dCQUN6Qiw0QkFBNEI7Z0JBQzVCLDJCQUEyQjtnQkFDM0IsMkJBQTJCO2dCQUMzQix1QkFBdUI7Z0JBQ3ZCLHdCQUF3QjtnQkFDeEIsZ0JBQWdCO2dCQUNoQixzQkFBc0I7Z0JBQ3RCLG1CQUFtQjtnQkFDbkIscUJBQXFCO2dCQUNyQixtQkFBbUI7Z0JBQ25CLCtCQUErQjtnQkFDL0Isd0JBQXdCO2dCQUN4Qiw0QkFBNEI7Z0JBQzVCLCtCQUErQjtnQkFDL0IsK0JBQStCO2dCQUMvQixpREFBaUQ7Z0JBQ2pELDhDQUE4QztnQkFDOUMsaURBQWlEO2dCQUNqRCx1QkFBdUI7Z0JBQ3ZCLGtDQUFrQztnQkFDbEMsbUJBQW1CO2dCQUNuQiwwQkFBMEI7Z0JBQzFCLGdDQUFnQzthQUNqQztZQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztTQUNqQixDQUFDO1FBRUYsK0VBQStFO1FBQy9FLE1BQU0sT0FBTyxHQUFHLGdCQUFNLENBQUMseUJBQXlCLENBQUMsQ0FBQztRQUNsRCxJQUFHLE9BQU8sRUFBRTtZQUNWLE1BQU0sSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsT0FBUSxDQUFDLENBQUM7WUFDMUQsTUFBTSxlQUFlLEdBQUcsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDLG9CQUFvQixDQUFDLENBQUE7WUFDckUsTUFBTSxXQUFXLEdBQUcsRUFBQyxLQUFLLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxlQUFlLENBQUMsRUFBQyxDQUFDO1lBQ25FLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1NBQzdDO1FBQ0QsTUFBTSxRQUFRLEdBQUcsZ0JBQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3BELElBQUcsUUFBUSxFQUFFO1lBQ1gsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRSxRQUFTLENBQUMsQ0FBQztZQUM5RCxNQUFNLGVBQWUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUMsb0JBQW9CLENBQUMsQ0FBQTtZQUNyRSxNQUFNLFdBQVcsR0FBRyxFQUFDLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLFVBQVUsRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFDLENBQUM7WUFDcEUsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7U0FDN0M7SUFDSCxDQUFDO0NBQ0Y7QUEzRUQsNEJBMkVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJAYXdzLWNkay9hd3MtaWFtXCI7XG5pbXBvcnQgZ2V0RW52IGZyb20gJy4vY29tbW9uJztcblxuZXhwb3J0IGNsYXNzIElBTVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IGNkay5Db25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHBvbGljeVN0YXRlbWVudFByb3BzOiBpYW0uUG9saWN5U3RhdGVtZW50UHJvcHMgPSB7XG4gICAgICBzaWQ6ICdBbGxvd0F1dG9tYXRpb25PcGVyYXRpb25zJyxcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkdldFRlbXBsYXRlJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlbGV0ZVN0YWNrJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlbGV0ZUNoYW5nZVNldCcsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpDcmVhdGVDaGFuZ2VTZXQnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVDaGFuZ2VTZXQnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RXhlY3V0ZUNoYW5nZVNldCcsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrRXZlbnRzJyxcbiAgICAgICAgJ3MzOionLCAvLyBUT0RPIC0gYmUgbW9yZSBzcGVjaWZpYyBoZXJlLiAgTm90IHRvbyBoYXJtZnVsIGFzIHNob3VsZCBvbmx5IGJlIGdyYW50ZWQgdG8gdGhlIHJvbGUgdXNlZCBmb3IgQ0kvQ0QuXG4gICAgICAgICdpYW06Q3JlYXRlUm9sZScsXG4gICAgICAgICdpYW06RGV0YWNoUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06QXR0YWNoUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06RGVsZXRlUm9sZScsXG4gICAgICAgICdpYW06R2V0Um9sZScsXG4gICAgICAgICdpYW06UGFzc1JvbGUnLFxuICAgICAgICAnaWFtOlB1dFJvbGVQb2xpY3knLFxuICAgICAgICAnaWFtOkdldFJvbGVQb2xpY3knLFxuICAgICAgICAnaWFtOkRlbGV0ZVJvbGVQb2xpY3knLFxuICAgICAgICAnbGFtYmRhOkNyZWF0ZUZ1bmN0aW9uJyxcbiAgICAgICAgJ2xhbWJkYTpEZWxldGVGdW5jdGlvbicsXG4gICAgICAgICdsYW1iZGE6R2V0RnVuY3Rpb25Db25maWd1cmF0aW9uJyxcbiAgICAgICAgJ2xhbWJkYTpHZXRGdW5jdGlvbicsXG4gICAgICAgICdsYW1iZGE6QWRkUGVybWlzc2lvbicsXG4gICAgICAgICdsYW1iZGE6UmVtb3ZlUGVybWlzc2lvbicsXG4gICAgICAgICdsYW1iZGE6UHVibGlzaExheWVyVmVyc2lvbicsXG4gICAgICAgICdsYW1iZGE6RGVsZXRlTGF5ZXJWZXJzaW9uJyxcbiAgICAgICAgJ2xhbWJkYTpVcGRhdGVGdW5jdGlvbkNvZGUnLFxuICAgICAgICAnbGFtYmRhOkludm9rZUZ1bmN0aW9uJyxcbiAgICAgICAgJ2xhbWJkYTpHZXRMYXllclZlcnNpb24nLFxuICAgICAgICAnZXZlbnRzOlB1dFJ1bGUnLFxuICAgICAgICAnZXZlbnRzOlJlbW92ZVRhcmdldHMnLFxuICAgICAgICAnZXZlbnRzOkRlbGV0ZVJ1bGUnLFxuICAgICAgICAnZXZlbnRzOkRlc2NyaWJlUnVsZScsXG4gICAgICAgICdldmVudHM6UHV0VGFyZ2V0cycsXG4gICAgICAgICdjbG91ZGZyb250OkNyZWF0ZURpc3RyaWJ1dGlvbicsXG4gICAgICAgICdjbG91ZGZyb250OlRhZ1Jlc291cmNlJyxcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6R2V0RGlzdHJpYnV0aW9uJyxcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6VXBkYXRlRGlzdHJpYnV0aW9uJyxcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6RGVsZXRlRGlzdHJpYnV0aW9uJyxcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6Q3JlYXRlQ2xvdWRGcm9udE9yaWdpbkFjY2Vzc0lkZW50aXR5JyxcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6R2V0Q2xvdWRGcm9udE9yaWdpbkFjY2Vzc0lkZW50aXR5JyxcbiAgICAgICAgJ2Nsb3VkZnJvbnQ6RGVsZXRlQ2xvdWRGcm9udE9yaWdpbkFjY2Vzc0lkZW50aXR5JyxcbiAgICAgICAgJ3JvdXRlNTM6R2V0SG9zdGVkWm9uZScsXG4gICAgICAgICdyb3V0ZTUzOkNoYW5nZVJlc291cmNlUmVjb3JkU2V0cycsXG4gICAgICAgICdyb3V0ZTUzOkdldENoYW5nZScsXG4gICAgICAgICdyb3V0ZTUzOkdldENoYW5nZVJlcXVlc3QnLFxuICAgICAgICAncm91dGU1MzpMaXN0UmVzb3VyY2VSZWNvcmRTZXRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogWycqJ11cbiAgICB9O1xuXG4gICAgLy8gQXBwbHkgdGhlIHBvbGljeSB0byBlaXRoZXIgYSByb2xlIG9yIGEgZ3JvdXAgZGVwZW5kaW5nIG9uIHdoYXQgd2FzIHNwZWNpZmllZFxuICAgIGNvbnN0IHJvbGVBcm4gPSBnZXRFbnYoJ0FXU19BVVRPTUFUSU9OX1JPTEVfQVJOJyk7XG4gICAgaWYocm9sZUFybikge1xuICAgICAgY29uc3Qgcm9sZSA9IGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHRoaXMsIFwiUm9sZVwiLCByb2xlQXJuISk7XG4gICAgICBjb25zdCBwb2xpY3lTdGF0ZW1lbnQgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudChwb2xpY3lTdGF0ZW1lbnRQcm9wcylcbiAgICAgIGNvbnN0IHBvbGljeVByb3BzID0ge3JvbGVzOiBbcm9sZV0sIHN0YXRlbWVudHM6IFtwb2xpY3lTdGF0ZW1lbnRdfTtcbiAgICAgIG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiUG9saWN5XCIsIHBvbGljeVByb3BzKTtcbiAgICB9XG4gICAgY29uc3QgZ3JvdXBBcm4gPSBnZXRFbnYoJ0FXU19BVVRPTUFUSU9OX0dST1VQX0FSTicpO1xuICAgIGlmKGdyb3VwQXJuKSB7XG4gICAgICBjb25zdCBncm91cCA9IGlhbS5Hcm91cC5mcm9tR3JvdXBBcm4odGhpcywgXCJSb2xlXCIsIGdyb3VwQXJuISk7XG4gICAgICBjb25zdCBwb2xpY3lTdGF0ZW1lbnQgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudChwb2xpY3lTdGF0ZW1lbnRQcm9wcylcbiAgICAgIGNvbnN0IHBvbGljeVByb3BzID0ge2dyb3VwOiBbZ3JvdXBdLCBzdGF0ZW1lbnRzOiBbcG9saWN5U3RhdGVtZW50XX07XG4gICAgICBuZXcgaWFtLlBvbGljeSh0aGlzLCBcIlBvbGljeVwiLCBwb2xpY3lQcm9wcyk7XG4gICAgfVxuICB9XG59XG4iXX0=