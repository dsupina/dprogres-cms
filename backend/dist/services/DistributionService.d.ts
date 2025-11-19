import AiAuthorService from './AiAuthorService';
import { type DistributionLog, type PublishingSchedule } from '../db/distribution';
interface DispatchResult {
    schedule: PublishingSchedule;
    log: DistributionLog;
}
interface DispatchOptions {
    requestAiAssets?: boolean;
    customMessage?: string;
}
export default class DistributionService {
    private aiAuthor;
    constructor(aiAuthor?: AiAuthorService);
    dispatchSchedule(scheduleId: number, options?: DispatchOptions): Promise<DispatchResult>;
    dispatchImmediate(postId: number, targetId: number, options?: DispatchOptions): Promise<DispatchResult>;
    resendFromLog(logId: number, dispatchImmediately?: boolean): Promise<DispatchResult | null>;
    updateFeedback(logId: number, feedback: Record<string, any>): Promise<DistributionLog | null>;
    private shouldRequestAi;
    private getPost;
    private buildPayload;
    private composeTweet;
    private sendToChannel;
}
export {};
//# sourceMappingURL=DistributionService.d.ts.map