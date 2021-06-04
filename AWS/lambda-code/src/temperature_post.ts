import * as cdk from 'aws-sdk';

async function lambdaHandler(event: any): Promise<any> {
  try {
    console.debug(`Temperature event = ${JSON.stringify(event)}`);
    console.debug(`event.body = ${JSON.stringify(event.body)}`);

    const body = JSON.parse(event.body);
    console.debug(`body = ${JSON.stringify(body)}`);

    return {
      statusCode: 200,
      body: `${JSON.stringify({"OK": "OK"})}`
    }
  }
  catch (err) {
    console.error(`Error: ${err.stack}`);
    return {
      statusCode: 500,
      body: "Error"
    }
  }
}

export { lambdaHandler };