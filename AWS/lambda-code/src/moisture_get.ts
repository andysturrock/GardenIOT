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
    console.error(`Error: ${err.stack}`);
    return {
      statusCode: 500,
      body: "Error"
    }
  }
}

export { lambdaHandler };