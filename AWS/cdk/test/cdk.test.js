"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("@aws-cdk/assert");
const cdk = require("aws-cdk-lib");
const lambda_stack_1 = require("../lib/lambda-stack");
const dynamodb_stack_1 = require("../lib/dynamodb-stack");
test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const dynamoDBStack = new dynamodb_stack_1.DynamoDBStack(app, 'DynamoDBStack');
    const stack = new lambda_stack_1.LambdaStack(app, 'MyTestStack', {
        temperatureHistoryTable: dynamoDBStack.temperatureHistoryTable,
        lastSensorReadingTable: dynamoDBStack.lastSensorReadingTable
    });
    // THEN
    assert_1.expect(stack).to(assert_1.matchTemplate({
        "Resources": {}
    }, assert_1.MatchStyle.EXACT));
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjZGsudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLDRDQUFpRjtBQUNqRixtQ0FBb0M7QUFDcEMsc0RBQWtEO0FBQ2xELDBEQUFzRDtBQUV0RCxJQUFJLENBQUMsYUFBYSxFQUFFLEdBQUcsRUFBRTtJQUNyQixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxQixPQUFPO0lBQ1AsTUFBTSxhQUFhLEdBQUcsSUFBSSw4QkFBYSxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUM5RCxNQUFNLEtBQUssR0FBRyxJQUFJLDBCQUFXLENBQUMsR0FBRyxFQUFFLGFBQWEsRUFBRTtRQUNoRCx1QkFBdUIsRUFBRSxhQUFhLENBQUMsdUJBQXVCO1FBQzlELHNCQUFzQixFQUFFLGFBQWEsQ0FBQyxzQkFBc0I7S0FDN0QsQ0FBQyxDQUFDO0lBQ0gsT0FBTztJQUNQLGVBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsc0JBQWEsQ0FBQztRQUNoQyxXQUFXLEVBQUUsRUFBRTtLQUNoQixFQUFFLG1CQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQTtBQUN6QixDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4cGVjdCBhcyBleHBlY3RDREssIG1hdGNoVGVtcGxhdGUsIE1hdGNoU3R5bGUgfSBmcm9tICdAYXdzLWNkay9hc3NlcnQnO1xyXG5pbXBvcnQgKiBhcyBjZGsgIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0IHsgTGFtYmRhU3RhY2sgfSBmcm9tICcuLi9saWIvbGFtYmRhLXN0YWNrJztcclxuaW1wb3J0IHsgRHluYW1vREJTdGFjayB9IGZyb20gJy4uL2xpYi9keW5hbW9kYi1zdGFjayc7XHJcblxyXG50ZXN0KCdFbXB0eSBTdGFjaycsICgpID0+IHtcclxuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XHJcbiAgICAvLyBXSEVOXHJcbiAgICBjb25zdCBkeW5hbW9EQlN0YWNrID0gbmV3IER5bmFtb0RCU3RhY2soYXBwLCAnRHluYW1vREJTdGFjaycpO1xyXG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgTGFtYmRhU3RhY2soYXBwLCAnTXlUZXN0U3RhY2snLCB7XHJcbiAgICAgIHRlbXBlcmF0dXJlSGlzdG9yeVRhYmxlOiBkeW5hbW9EQlN0YWNrLnRlbXBlcmF0dXJlSGlzdG9yeVRhYmxlLFxyXG4gICAgICBsYXN0U2Vuc29yUmVhZGluZ1RhYmxlOiBkeW5hbW9EQlN0YWNrLmxhc3RTZW5zb3JSZWFkaW5nVGFibGVcclxuICAgIH0pO1xyXG4gICAgLy8gVEhFTlxyXG4gICAgZXhwZWN0Q0RLKHN0YWNrKS50byhtYXRjaFRlbXBsYXRlKHtcclxuICAgICAgXCJSZXNvdXJjZXNcIjoge31cclxuICAgIH0sIE1hdGNoU3R5bGUuRVhBQ1QpKVxyXG59KTtcclxuIl19