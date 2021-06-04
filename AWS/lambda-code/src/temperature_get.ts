import { DynamoDBClient, QueryCommand, QueryCommandInput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';

async function lambdaHandler(event: any): Promise<any> {
  try {
    const sensorIds: Array<number> = [];
    for (const key in event.queryStringParameters) {
      const sensorId = key.replace(/sensor_id/g, '');
      sensorIds.push(Number.parseInt(sensorId));
    }

    const ddbClient = new DynamoDBClient({});

    // Get the latest timestamp
    const params: QueryCommandInput = {
      TableName: "LastTimestamp",
      KeyConditionExpression: "#table = :table",
      ExpressionAttributeNames: {"#table": "table"},
      ExpressionAttributeValues: { ":table" : {"S" : "Temperature"}}
    };
    const data = await ddbClient.send(new QueryCommand(params));
    const timestamp = data.Items?.[0].timestamp.N;
    console.debug(`Last timestamp on Temperature table was ${timestamp}`);

    let returnStruct = [];
    for (const sensorId of sensorIds) {
      const params: QueryCommandInput = {
        TableName: "Temperature",
        KeyConditionExpression: "#timestamp = :timestamp AND sensor_id = :sensor_id",
        ExpressionAttributeNames: {"#timestamp": "timestamp"},
        ExpressionAttributeValues: {
          ":sensor_id" : {"N" : `${sensorId}`},
          ":timestamp" : {"N" : `${timestamp}`}
        }
      };
      const data = await ddbClient.send(new QueryCommand(params));
      const temperature = data.Items?.[0].temperature.N;
      returnStruct.push({
        "sensor_id": sensorId,
        "temperature": `${temperature}`,
        "timestamp": `${timestamp}`
      })
    }

    return {
      statusCode: 200,
      body: `${JSON.stringify(returnStruct)}`
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