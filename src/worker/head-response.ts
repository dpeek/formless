export function getEquivalentRequestForHead(request: Request): Request {
  return request.method === "HEAD" ? new Request(request, { method: "GET" }) : request;
}

export function responseWithoutBodyForHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") {
    return response;
  }

  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
