import type { Instrumentation } from "next";
import { reportServerError } from "@/lib/monitoring";

export function register() {}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  reportServerError(error, {
    routePath: context.routePath,
    routeType: context.routeType,
    method: request.method,
  });
};
