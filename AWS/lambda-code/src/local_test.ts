import { lambdaHandler as temperatureGetLambdaHandler } from './temperature_get';
import { lambdaHandler as temperaturePostLambdaHandler } from './temperature_post';

require('dotenv').config()

process.env.AWS_REGION = 'eu-west-1';

async function testTemperatureGetHandler() {
  const getEvent = createGetEvent();
  const result = await temperatureGetLambdaHandler(getEvent);

  console.log(`result: ${JSON.stringify(result)}`);
}

async function testTemperaturePostHandler() {
  const getEvent = createPostEvent();
  const result = await temperaturePostLambdaHandler(getEvent);

  console.log(`result: ${JSON.stringify(result)}`);
}

// testTemperaturePostHandler()
testTemperatureGetHandler()

function createPostEvent() {
  return {
    "resource": "/temperature",
    "path": "/0_0_1/temperature",
    "httpMethod": "POST",
    "headers": {
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "Host": "api.gardeniot.dev.goatsinlace.com",
      "Postman-Token": "2b94af97-5278-452e-8983-1d6aac3b3929",
      "User-Agent": "PostmanRuntime/7.28.0",
      "X-Amzn-Trace-Id": "Root=1-60ba6cfd-2981927d17d4a0694c88c130",
      "X-Forwarded-For": "81.107.0.49",
      "X-Forwarded-Port": "443",
      "X-Forwarded-Proto": "https"
    },
    "multiValueHeaders": {
      "Accept": [
        "*/*"
      ],
      "Accept-Encoding": [
        "gzip, deflate, br"
      ],
      "Cache-Control": [
        "no-cache"
      ],
      "Content-Type": [
        "application/json"
      ],
      "Host": [
        "api.gardeniot.dev.goatsinlace.com"
      ],
      "Postman-Token": [
        "2b94af97-5278-452e-8983-1d6aac3b3929"
      ],
      "User-Agent": [
        "PostmanRuntime/7.28.0"
      ],
      "X-Amzn-Trace-Id": [
        "Root=1-60ba6cfd-2981927d17d4a0694c88c130"
      ],
      "X-Forwarded-For": [
        "81.107.0.49"
      ],
      "X-Forwarded-Port": [
        "443"
      ],
      "X-Forwarded-Proto": [
        "https"
      ]
    },
    "queryStringParameters": null,
    "multiValueQueryStringParameters": null,
    "pathParameters": null,
    "stageVariables": null,
    "requestContext": {
      "resourceId": "nva6hs",
      "resourcePath": "/temperature",
      "httpMethod": "POST",
      "extendedRequestId": "AaX3pGxsDoEF7Ww=",
      "requestTime": "04/Jun/2021:18:12:13 +0000",
      "path": "/0_0_1/temperature",
      "accountId": "089953642441",
      "protocol": "HTTP/1.1",
      "stage": "0_0_1",
      "domainPrefix": "api",
      "requestTimeEpoch": 1622830333594,
      "requestId": "b6781148-4ccf-4c06-b5ed-27aeaea4e3e8",
      "identity": {
        "cognitoIdentityPoolId": null,
        "accountId": null,
        "cognitoIdentityId": null,
        "caller": null,
        "sourceIp": "81.107.0.49",
        "principalOrgId": null,
        "accessKey": null,
        "cognitoAuthenticationType": null,
        "cognitoAuthenticationProvider": null,
        "userArn": null,
        "userAgent": "PostmanRuntime/7.28.0",
        "user": null
      },
      "domainName": "api.gardeniot.dev.goatsinlace.com",
      "apiId": "brnf1jaz10"
    },
    "body": `[
      {"sensor_id": 0,"temperature": "17.05"},
      {"sensor_id": 1,"temperature": "19.25"}
    ]`,
    "isBase64Encoded": false
  }
}

function createGetEvent() {
  return {
    "resource": "/temperature",
    "path": "/0_0_1/temperature",
    "httpMethod": "GET",
    "headers": {
      "Accept": "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      "Host": "api.gardeniot.dev.goatsinlace.com",
      "Postman-Token": "b06a0ac1-3a12-411a-8bbd-b8b6f76c271b",
      "User-Agent": "PostmanRuntime/7.28.0",
      "X-Amzn-Trace-Id": "Root=1-60ba9d16-06289d141b005f4c450173ee",
      "X-Forwarded-For": "81.107.0.49",
      "X-Forwarded-Port": "443",
      "X-Forwarded-Proto": "https"
    },
    "multiValueHeaders": {
      "Accept": [
        "*/*"
      ],
      "Accept-Encoding": [
        "gzip, deflate, br"
      ],
      "Cache-Control": [
        "no-cache"
      ],
      "Host": [
        "api.gardeniot.dev.goatsinlace.com"
      ],
      "Postman-Token": [
        "b06a0ac1-3a12-411a-8bbd-b8b6f76c271b"
      ],
      "User-Agent": [
        "PostmanRuntime/7.28.0"
      ],
      "X-Amzn-Trace-Id": [
        "Root=1-60ba9d16-06289d141b005f4c450173ee"
      ],
      "X-Forwarded-For": [
        "81.107.0.49"
      ],
      "X-Forwarded-Port": [
        "443"
      ],
      "X-Forwarded-Proto": [
        "https"
      ]
    },
    "queryStringParameters": {
      "sensor_id0": "",
      "sensor_id1": ""
    },
    "multiValueQueryStringParameters": {
      "sensor_id0": [
        ""
      ],
      "sensor_id1": [
        ""
      ]
    },
    "pathParameters": null,
    "stageVariables": null,
    "requestContext": {
      "resourceId": "nva6hs",
      "resourcePath": "/temperature",
      "httpMethod": "GET",
      "extendedRequestId": "Aa17fFQrjoEFmHg=",
      "requestTime": "04/Jun/2021:21:37:26 +0000",
      "path": "/0_0_1/temperature",
      "accountId": "089953642441",
      "protocol": "HTTP/1.1",
      "stage": "0_0_1",
      "domainPrefix": "api",
      "requestTimeEpoch": 1622842646176,
      "requestId": "36e93b8b-1aab-471a-bd64-92a9caafe070",
      "identity": {
        "cognitoIdentityPoolId": null,
        "accountId": null,
        "cognitoIdentityId": null,
        "caller": null,
        "sourceIp": "81.107.0.49",
        "principalOrgId": null,
        "accessKey": null,
        "cognitoAuthenticationType": null,
        "cognitoAuthenticationProvider": null,
        "userArn": null,
        "userAgent": "PostmanRuntime/7.28.0",
        "user": null
      },
      "domainName": "api.gardeniot.dev.goatsinlace.com",
      "apiId": "brnf1jaz10"
    },
    "body": null,
    "isBase64Encoded": false
  }

}