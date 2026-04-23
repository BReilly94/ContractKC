import { newCorrelationId, runWithCorrelation } from '@ckb/shared';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : newCorrelationId();
    res.setHeader(HEADER, correlationId);
    runWithCorrelation(correlationId, () => next());
  }
}
