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
// testTemperatureGetHandler()
testTemperaturePostHandler()

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
    "path": "/1_2_3_4/temperature",
    "httpMethod": "GET",
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Host": "api.gardeniot.dev.goatsinlace.com",
      "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"90\", \"Google Chrome\";v=\"90\"",
      "sec-ch-ua-mobile": "?0",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
      "X-Amzn-Trace-Id": "Root=1-60b1291e-4530e6ad6b0a58c90295174b",
      "X-Forwarded-For": "81.107.0.49",
      "X-Forwarded-Port": "443",
      "X-Forwarded-Proto": "https"
    },
    "multiValueHeaders": {
      "accept": [
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9"
      ],
      "accept-encoding": [
        "gzip, deflate, br"
      ],
      "accept-language": [
        "en-GB,en-US;q=0.9,en;q=0.8"
      ],
      "Host": [
        "api.gardeniot.dev.goatsinlace.com"
      ],
      "sec-ch-ua": [
        "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"90\", \"Google Chrome\";v=\"90\""
      ],
      "sec-ch-ua-mobile": [
        "?0"
      ],
      "sec-fetch-dest": [
        "document"
      ],
      "sec-fetch-mode": [
        "navigate"
      ],
      "sec-fetch-site": [
        "none"
      ],
      "sec-fetch-user": [
        "?1"
      ],
      "upgrade-insecure-requests": [
        "1"
      ],
      "User-Agent": [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
      ],
      "X-Amzn-Trace-Id": [
        "Root=1-60b1291e-4530e6ad6b0a58c90295174b"
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
      "name1": "value1",
      "name2": "value2"
    },
    "multiValueQueryStringParameters": {
      "name1": [
        "value1"
      ],
      "name2": [
        "value2"
      ]
    },
    "pathParameters": null,
    "stageVariables": null,
    "requestContext": {
      "resourceId": "jmbeck",
      "resourcePath": "/temperature",
      "httpMethod": "GET",
      "extendedRequestId": "ADNcyHFcDoEFYnQ=",
      "requestTime": "28/May/2021:17:32:14 +0000",
      "path": "/1_2_3_4/temperature",
      "accountId": "089953642441",
      "protocol": "HTTP/1.1",
      "stage": "1_2_3_4",
      "domainPrefix": "api",
      "requestTimeEpoch": 1622223134479,
      "requestId": "968e5199-5500-4a68-81a6-e99f0291a451",
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
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
        "user": null
      },
      "domainName": "api.gardeniot.dev.goatsinlace.com",
      "apiId": "ss8oclj6d6"
    },
    "body": null,
    "isBase64Encoded": false
  }
}