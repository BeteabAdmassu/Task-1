import { ReturnReasonCode } from '../common/enums/return-reason-code.enum';
import { ReturnPolicy } from './entities/return-policy.entity';

export class RestockingFeeEngine {
  /**
   * Returns the restocking fee percentage to apply.
   * Zero-fee reasons: DAMAGED, WRONG_ITEM.
   * Late returns (> threshold days): higher rate.
   * Otherwise: default rate.
   */
  static calculate(
    reasonCode: ReturnReasonCode,
    daysSinceReceipt: number,
    policy: ReturnPolicy,
  ): number {
    if (
      reasonCode === ReturnReasonCode.DAMAGED ||
      reasonCode === ReturnReasonCode.WRONG_ITEM
    ) {
      return 0;
    }
    if (daysSinceReceipt > policy.restockingFeeAfterDaysThreshold) {
      return Number(policy.restockingFeeAfterDays);
    }
    return Number(policy.restockingFeeDefault);
  }
}
