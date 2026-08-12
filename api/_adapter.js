function parseCookies(cookieHeader) {
  const list = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

export function createNetlifyHandler(vercelHandler) {
  return async (event, context) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Cookie',
      'Access-Control-Allow-Credentials': 'true',
      'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    let statusCode = 200;
    let bodyResponse = '';

    let parsedBody = {};
    if (event.body) {
      try {
        const rawBody = event.isBase64Encoded
          ? Buffer.from(event.body, 'base64').toString('utf8')
          : event.body;
        parsedBody = JSON.parse(rawBody);
      } catch (e) {
        parsedBody = {};
      }
    }

    const req = {
      method: event.httpMethod,
      query: event.queryStringParameters || {},
      body: parsedBody,
      headers: event.headers || {},
      cookies: parseCookies(event.headers?.cookie || event.headers?.Cookie || '')
    };

    const res = {
      status(code) {
        statusCode = code;
        return res;
      },
      setHeader(key, value) {
        headers[key] = value;
        return res;
      },
      json(data) {
        bodyResponse = JSON.stringify(data);
        return res;
      },
      send(data) {
        bodyResponse = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return res;
      }
    };

    try {
      await vercelHandler(req, res);
    } catch (err) {
      statusCode = 500;
      bodyResponse = JSON.stringify({ success: false, message: err.message });
    }

    return {
      statusCode,
      headers,
      body: bodyResponse
    };
  };
}
