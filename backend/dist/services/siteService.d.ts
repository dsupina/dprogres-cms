export interface Site {
    id: number;
    domain_id: number;
    name: string;
    base_path: string;
    title?: string;
    description?: string;
    is_default: boolean;
    is_active: boolean;
    settings: any;
    created_at: Date;
    updated_at: Date;
}
export interface CreateSiteDto {
    domain_id: number;
    name: string;
    base_path?: string;
    title?: string;
    description?: string;
    is_default?: boolean;
    is_active?: boolean;
    settings?: any;
}
export interface UpdateSiteDto {
    name?: string;
    base_path?: string;
    title?: string;
    description?: string;
    is_default?: boolean;
    is_active?: boolean;
    settings?: any;
}
declare class SiteService {
    getAllSites(domainId?: number): Promise<Site[]>;
    getSiteById(id: number): Promise<Site | null>;
    getSitesByDomain(domainId: number): Promise<Site[]>;
    createSite(data: CreateSiteDto): Promise<Site>;
    updateSite(id: number, data: UpdateSiteDto): Promise<Site | null>;
    deleteSite(id: number): Promise<boolean>;
    getDefaultSiteForDomain(domainId: number): Promise<Site | null>;
    resolveSiteByHostAndPath(hostname: string, path: string): Promise<Site | null>;
}
export declare const siteService: SiteService;
export {};
//# sourceMappingURL=siteService.d.ts.map