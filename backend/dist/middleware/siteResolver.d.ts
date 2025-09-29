import { Request, Response, NextFunction } from 'express';
export interface SiteContext {
    domainId: number;
    siteId: number | null;
    siteName: string;
    basePath: string;
}
declare global {
    namespace Express {
        interface Request {
            siteContext?: SiteContext;
        }
    }
}
export declare function siteResolver(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireSiteContext(req: Request, res: Response, next: NextFunction): void;
export declare function clearSiteCache(): void;
export declare function clearSiteCacheEntry(hostname: string, basePath: string): void;
//# sourceMappingURL=siteResolver.d.ts.map