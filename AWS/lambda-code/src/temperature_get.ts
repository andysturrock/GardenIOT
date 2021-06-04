function getRandomTemperature() : Number {
  const min = -10;
  const max = 40;
  return Math.random() * (max - min) + min
}

async function lambdaHandler(event: any): Promise<any> {
  try {
    // console.debug(`Temperature event = ${JSON.stringify(event)}`);
    console.debug(`params = ${JSON.stringify(event.queryStringParameters)}`);

    let returnStruct = [];

    let sensorId = 0;
    for(const key in event.queryStringParameters) {
      console.debug(`key = ${JSON.stringify(key)}`);
      const value = event.queryStringParameters[key];
      console.debug(`value = ${JSON.stringify(value)}`);

      returnStruct.push({
        "sensor_id": sensorId++,
        "temperature": getRandomTemperature().toFixed(2)
      },)
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