import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

async function lambdaHandler(event: any): Promise<any> {
  try {
    console.debug(`Temperature event = ${JSON.stringify(event)}`);
    console.debug(`event.body = ${JSON.stringify(event.body)}`);

    const body = JSON.parse(event.body);
    console.debug(`body = ${JSON.stringify(body)}`);

    const ddbClient = new DynamoDBClient({});

    const params = {
      TableName: "Temperature",
      Item: {
        timestamp: { N: "1" },
        sensor_id: { N: "0" },
        temperature: { N: "13.57" }
      },
    };

    const data = await ddbClient.send(new PutItemCommand(params));
    console.log(data);

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