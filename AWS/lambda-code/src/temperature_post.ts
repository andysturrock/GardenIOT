import { DynamoDBClient, PutItemCommand, PutItemCommandInput, UpdateItemCommand, UpdateItemCommandInput } from '@aws-sdk/client-dynamodb';

async function lambdaHandler(event: any): Promise<any> {
  try {

    const now = Date.now();

    // Check body contains data in correct format.
    const body = JSON.parse(event.body);
    const putItemCommandInputs: Array<PutItemCommandInput> = [];
    const updateItemCommandInput: Array<UpdateItemCommandInput> = [];

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

      // Params for inserting into the history table
      putItemCommandInputs.push({
        TableName: "TemperatureHistory",
        Item: {
          timestamp: { N: `${now}` },
          sensor_id: { N: `${item.sensor_id}` },
          temperature: { N: `${item.temperature}` }
        },
      });

      // And for the last value table
      updateItemCommandInput.push({
        TableName: 'LastSensorReading',
        Key: { "sensor_type": { S: 'temperature' }, "sensor_id": { N: `${item.sensor_id}` }, },
        UpdateExpression: "set #value = :value, #timestamp = :timestamp",
        ExpressionAttributeNames: { "#value": "value", "#timestamp": "timestamp" },
        ExpressionAttributeValues: {
          ":timestamp": { "N": `${now}` },
          ":value": { "N": `${item.temperature}` }
        }
      });
    }

    const ddbClient = new DynamoDBClient({});

    let count = 0;
    // First insert the reading into the history table
    for (const param of putItemCommandInputs) {
      // First insert the reading into the history table
      console.info(`Inserting: ${JSON.stringify(param)}`);
      // TODO - Turn this on when in production
      // console.debug("TODO - Skipping inserting into history table!!!")
      await ddbClient.send(new PutItemCommand(param));
      ++count;
    }
    // Then update the last sensor reading table
    for (const param of updateItemCommandInput) {
      // First insert the reading into the history table
      console.info(`Inserting: ${JSON.stringify(param)}`);
      await ddbClient.send(new UpdateItemCommand(param));
    }

    return {
      statusCode: 200,
      body: `${JSON.stringify({ "InsertCount": `${count}` })}`
    }
  }
  catch (err) {
    if(err instanceof Error) {
      console.error(`Error: ${err.stack}`);
    } else {
      console.error(`Error: ${JSON.stringify(err)}`);
    }
    return {
      statusCode: 500,
      body: "Error"
    }
  }
}

export { lambdaHandler };