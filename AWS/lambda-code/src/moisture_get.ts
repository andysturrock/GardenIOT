async function lambdaHandler(event: any): Promise<any> {
  try {
    const queries = JSON.stringify(event.queryStringParameters);
    console.debug(`moisture queries = ${queries}`);

    return {
      statusCode: 200,
      body: `Moisture Queries: ${queries}`
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