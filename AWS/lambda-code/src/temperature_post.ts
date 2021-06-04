import { DynamoDBClient, PutItemCommand, PutItemCommandInput } from '@aws-sdk/client-dynamodb';

async function lambdaHandler(event: any): Promise<any> {
  try {
    console.debug(`Temperature event = ${JSON.stringify(event)}`);
    console.debug(`event.body = ${JSON.stringify(event.body)}`);

    const body = JSON.parse(event.body);
    console.debug(`body = ${JSON.stringify(body)}`);

    let params: Array<PutItemCommandInput> = [];

    for (const item of body) {
      console.debug(`item = ${JSON.stringify(item)}`)
      if (!('sensor_id' in item)) {
        return {
          statusCode: 400,
          body: `Missing sensor_id field`
        }
      }
      if (!('temperature' in item)) {
        return {
          statusCode: 400,
          body: `Missing temperature field`
        }
      }
      params.push({
        TableName: "Temperature",
        Item: {
          timestamp: { N: "2" },
          sensor_id: { N: `${item.sensor_id}` },
          temperature: { N: `${item.temperature}` }
        },
      })
    }

    const ddbClient = new DynamoDBClient({});

    for(const param of params) {
      const data = await ddbClient.send(new PutItemCommand(param));
      console.log(data);
    }

    return {
      statusCode: 200,
      body: `${JSON.stringify({ "OK": "OK" })}`
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