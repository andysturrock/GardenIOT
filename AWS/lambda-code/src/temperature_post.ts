import { DynamoDBClient, PutItemCommand, PutItemCommandInput, UpdateItemCommand, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';

async function lambdaHandler(event: any): Promise<any> {
  try {

    const now = Date.now();

    // Check body contains data in correct format.
    const body = JSON.parse(event.body);
    const params: Array<PutItemCommandInput> = [];

    for (const item of body) {
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
          timestamp: { N: `${now}` },
          sensor_id: { N: `${item.sensor_id}` },
          temperature: { N: `${item.temperature}` }
        },
      })
    }

    const ddbClient = new DynamoDBClient({});

    let count = 0;
    for (const param of params) {
      console.info(`Inserting: ${JSON.stringify(param)}`);
      const data = await ddbClient.send(new PutItemCommand(param));
      ++count;
    }

    // Update the last timestamp table
    const param: UpdateItemCommandInput = {
      TableName: 'LastTimestamp',
      Key: { "table": { S: 'Temperature' } },
      UpdateExpression: "set #timestamp = :timestamp",
      ExpressionAttributeNames: {"#timestamp": "timestamp"},
      ExpressionAttributeValues: { ":timestamp": { "N": `${now}` } }
    };
    await ddbClient.send(new UpdateItemCommand(param));

    return {
      statusCode: 200,
      body: `${JSON.stringify({ "InsertCount": `${count}` })}`
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