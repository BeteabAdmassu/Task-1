import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import * as crypto from 'crypto';
import { ObservabilityService } from '../../observability/observability.service';


@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly observability: ObservabilityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id?: string };
      requestId?: string;
      body?: unknown;
    }>();

    const requestId = crypto.randomBytes(8).toString('hex');
    req.requestId = requestId;

    const start = Date.now();
    const method = req.method;
    const path = req.url;
    const userId = req.user?.id ?? null;

    // Skip logging for health checks and log endpoint itself to avoid noise
    const isNoise =
      path === '/api/health' ||
      path.startsWith('/api/admin/logs');

    return next.handle().pipe(
      tap(() => {
        if (isNoise) return;
        const res = context.switchToHttp().getResponse<{ statusCode: number }>();
        const statusCode = res.statusCode;
        const durationMs = Date.now() - start;
        void this.observability.writeLog({
          requestId,
          userId,
          level: statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO',
          service: 'HTTP',
          message: `${method} ${path} ${statusCode}`,
          method,
          path,
          statusCode,
          durationMs,
        });
      }),
      catchError((err: unknown) => {
        if (!isNoise) {
          const statusCode =
            typeof err === 'object' && err !== null && 'status' in err
              ? (err as { status: number }).status
              : 500;
          const message =
            typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Internal error';
          const durationMs = Date.now() - start;
          void this.observability.writeLog({
            requestId,
            userId,
            level: 'ERROR',
            service: 'HTTP',
            message: `${method} ${path} ${statusCode} — ${message}`,
            method,
            path,
            statusCode,
            durationMs,
          });
        }
        return throwError(() => err);
      }),
    );
  }
}
