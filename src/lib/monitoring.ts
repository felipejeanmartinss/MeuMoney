type ErrorContext = {
  routePath?: string;
  routeType?: string;
  method?: string;
};

export function createSafeErrorEvent(
  error: unknown,
  context: ErrorContext = {},
) {
  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest.slice(0, 80)
      : undefined;

  return {
    level: "error",
    event: "unhandled_server_error",
    route: context.routePath?.slice(0, 160) ?? "unknown",
    route_type: context.routeType?.slice(0, 40) ?? "unknown",
    method: context.method?.slice(0, 12),
    digest,
    error_name: error instanceof Error ? error.name.slice(0, 60) : "Unknown",
    timestamp: new Date().toISOString(),
  };
}

export function reportServerError(
  error: unknown,
  context: ErrorContext = {},
) {
  console.error(JSON.stringify(createSafeErrorEvent(error, context)));
}
