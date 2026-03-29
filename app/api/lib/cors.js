export function corsHeaders(methods = "GET, POST, OPTIONS") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function optionsResponse(methods) {
  return new Response(null, { status: 200, headers: corsHeaders(methods) });
}
