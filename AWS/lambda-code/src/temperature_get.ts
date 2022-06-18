import { DynamoDBClient, QueryCommand, QueryCommandInput, QueryCommandOutput } from '@aws-sdk/client-dynamodb';

async function lambdaHandler(event: any): Promise<any> {
  try {
    const sensorIds: Array<number> = [];
    for (const key in event.queryStringParameters) {
      const sensorId = key.replace(/sensor_id/g, '');
      sensorIds.push(Number.parseInt(sensorId));
    }

    const ddbClient = new DynamoDBClient({});

    let returnStruct = [];
    for (const sensorId of sensorIds) {
      const params: QueryCommandInput = {
        TableName: "LastSensorReading",
        KeyConditionExpression: "sensor_type = :sensor_type AND sensor_id = :sensor_id",
        ExpressionAttributeValues: {
          ":sensor_type" : {"S" : `temperature`},
          ":sensor_id" : {"N" : `${sensorId}`},
        }
      };
      const data = await ddbClient.send(new QueryCommand(params));
      const items = data.Items;
      if(items && items.length > 0 && items[0].value) {
        if(items[0].value.N && items[0].timestamp.N) {
          const temperature = items[0].value.N;
          const timestamp = items[0].timestamp.N;
          returnStruct.push({
            "sensor_id": sensorId,
            "temperature": `${temperature}`,
            "timestamp": `${timestamp}`
          })
        }
      }
      
    }

    return {
      statusCode: 200,
      body: `${JSON.stringify(returnStruct)}`
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