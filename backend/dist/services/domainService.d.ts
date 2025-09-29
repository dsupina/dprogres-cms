declare class LRUCache<K, V> {
    private cache;
    private maxSize;
    constructor(maxSize?: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    clear(): void;
    size(): number;
}
export declare const domainCache: LRUCache<string, any>;
export interface Domain {
    id: number;
    hostname: string;
    ip_address?: string;
    is_active: boolean;
    is_default: boolean;
    verification_token?: string;
    verified_at?: Date;
    settings?: any;
    created_at: Date;
    updated_at: Date;
}
export interface CreateDomainDto {
    hostname: string;
    ip_address?: string;
    is_active?: boolean;
    is_default?: boolean;
}
export interface UpdateDomainDto {
    hostname?: string;
    ip_address?: string;
    is_active?: boolean;
    is_default?: boolean;
    settings?: any;
}
export declare class DomainService {
    static getAllDomains(): Promise<Domain[]>;
    static getDomainById(id: number): Promise<Domain | null>;
    static getDomainByHostname(hostname: string): Promise<Domain | null>;
    static getDefaultDomain(): Promise<Domain | null>;
    static createDomain(data: CreateDomainDto): Promise<Domain>;
    static updateDomain(id: number, data: UpdateDomainDto): Promise<Domain | null>;
    static deleteDomain(id: number): Promise<boolean>;
    static verifyDomain(id: number, token: string): Promise<boolean>;
    static generateVerificationTxtRecord(domain: Domain): string;
    static clearCache(): void;
    static getCacheStats(): {
        size: number;
        maxSize: number;
    };
}
export {};
//# sourceMappingURL=domainService.d.ts.map