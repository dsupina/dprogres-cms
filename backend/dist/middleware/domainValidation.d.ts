import { Request, Response, NextFunction } from 'express';
export declare function validateDomain(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function resolveDomain(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function clearDomainCache(): void;
//# sourceMappingURL=domainValidation.d.ts.map