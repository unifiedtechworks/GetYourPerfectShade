"use strict";

exports.handler = async (event) => {
  const requestId = event?.requestContext?.requestId ?? "unknown";
  console.info(JSON.stringify({
    level: "info",
    event: "placeholder_invoked",
    route: event?.requestContext?.http?.path ?? "/v1/account",
    requestId,
  }));

  return {
    statusCode: 501,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      error: "ACCOUNT_HANDLER_NOT_IMPLEMENTED",
      message: "Chat 2 owns the account application contract.",
      requestId,
    }),
  };
};
