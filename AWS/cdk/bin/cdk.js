#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("source-map-support/register");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const iam_stack_1 = require("../lib/iam-stack");
const lambda_stack_1 = require("../lib/lambda-stack");
const dynamodb_stack_1 = require("../lib/dynamodb-stack");
const app = new aws_cdk_lib_1.App();
new iam_stack_1.IAMStack(app, 'IAMStack');
const dynamoDBStack = new dynamodb_stack_1.DynamoDBStack(app, 'DynamoDBStack');
new lambda_stack_1.LambdaStack(app, 'LambdaStack', {
    temperatureHistoryTable: dynamoDBStack.temperatureHistoryTable,
    lastSensorReadingTable: dynamoDBStack.lastSensorReadingTable
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHVDQUFxQztBQUNyQyw2Q0FBa0M7QUFDbEMsZ0RBQTRDO0FBQzVDLHNEQUFrRDtBQUNsRCwwREFBc0Q7QUFFdEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxpQkFBRyxFQUFFLENBQUM7QUFDdEIsSUFBSSxvQkFBUSxDQUFDLEdBQUcsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUM5QixNQUFNLGFBQWEsR0FBRyxJQUFJLDhCQUFhLENBQUMsR0FBRyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBQzlELElBQUksMEJBQVcsQ0FBQyxHQUFHLEVBQUUsYUFBYSxFQUFFO0lBQ2xDLHVCQUF1QixFQUFFLGFBQWEsQ0FBQyx1QkFBdUI7SUFDOUQsc0JBQXNCLEVBQUUsYUFBYSxDQUFDLHNCQUFzQjtDQUM3RCxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXHJcbmltcG9ydCAnc291cmNlLW1hcC1zdXBwb3J0L3JlZ2lzdGVyJztcclxuaW1wb3J0IHsgQXBwIH0gZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBJQU1TdGFjayB9IGZyb20gJy4uL2xpYi9pYW0tc3RhY2snO1xyXG5pbXBvcnQgeyBMYW1iZGFTdGFjayB9IGZyb20gJy4uL2xpYi9sYW1iZGEtc3RhY2snO1xyXG5pbXBvcnQgeyBEeW5hbW9EQlN0YWNrIH0gZnJvbSAnLi4vbGliL2R5bmFtb2RiLXN0YWNrJztcclxuXHJcbmNvbnN0IGFwcCA9IG5ldyBBcHAoKTtcclxubmV3IElBTVN0YWNrKGFwcCwgJ0lBTVN0YWNrJyk7XHJcbmNvbnN0IGR5bmFtb0RCU3RhY2sgPSBuZXcgRHluYW1vREJTdGFjayhhcHAsICdEeW5hbW9EQlN0YWNrJyk7XHJcbm5ldyBMYW1iZGFTdGFjayhhcHAsICdMYW1iZGFTdGFjaycsIHtcclxuICB0ZW1wZXJhdHVyZUhpc3RvcnlUYWJsZTogZHluYW1vREJTdGFjay50ZW1wZXJhdHVyZUhpc3RvcnlUYWJsZSxcclxuICBsYXN0U2Vuc29yUmVhZGluZ1RhYmxlOiBkeW5hbW9EQlN0YWNrLmxhc3RTZW5zb3JSZWFkaW5nVGFibGVcclxufSk7XHJcbiJdfQ==