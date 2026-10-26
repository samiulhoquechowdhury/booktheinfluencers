import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { ZodError } from "zod";

/** Business-rule failures. Mapped to `{ error: { code, message, details } }` (trd.md §3). */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} not found`, 404);
export const forbidden = (message = "You don't have access to this") => new DomainError("FORBIDDEN", message, 403);
export const unauthenticated = (message = "Please sign in") => new DomainError("UNAUTHENTICATED", message, 401);

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION",
          message: "Please check the highlighted fields",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
      return;
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      res.status(status).json({ error: { code: status === 404 ? "NOT_FOUND" : "HTTP_ERROR", message: error.message } });
      return;
    }
    // Never leak internals (rules.md §6): log server-side, answer generically.
    this.logger.error(error instanceof Error ? error.stack : String(error));
    res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
  }
}
