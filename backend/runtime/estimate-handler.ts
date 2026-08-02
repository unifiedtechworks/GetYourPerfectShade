import {
  createEstimateHandlers,
  type HttpApiEvent,
  type HttpApiResponse,
} from "../estimates";
import { RdsDataDatabase } from "../shared/rds-data";

type RoutedHttpApiEvent = HttpApiEvent & Readonly<{
  requestContext: HttpApiEvent["requestContext"] & Readonly<{
    http?: Readonly<{ method?: string; path?: string }>;
  }>;
}>;

const handlers = createEstimateHandlers(new RdsDataDatabase());

export async function handler(event: RoutedHttpApiEvent): Promise<HttpApiResponse> {
  const method = event.requestContext.http?.method;
  const path = event.requestContext.http?.path;
  if (method === "GET" && path === "/v1/estimates") {
    return handlers.list(event);
  }
  if (method === "POST" && path === "/v1/estimates/drafts") {
    return handlers.createDraft(event);
  }
  return {
    statusCode: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      error: {
        code: "route_not_found",
        message: "The requested route does not exist.",
        requestId: event.requestContext.requestId,
      },
    }),
  };
}
