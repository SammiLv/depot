/**
 * 「人才决策事实」三项从盘点历史（TalentReviewResult.gradeCode）自动计算：
 * - 盘点2次C级：当前聘期内 C 级次数 ≥ 2
 * - 连续2次C级：当前聘期内最近两次盘点连续为 C
 * - 续聘前盘点C级：当前聘期开始前的最后一次盘点为 C
 * 周期粒度为半年（TalentReviewParticipant.periodYear/periodHalfYear），与聘期起止按所在半年对齐。
 * 返回 null 表示无法判定（显示「未维护」）：无聘期信息、或对应区间内没有盘点记录。
 */
export type ReviewPeriodGrade = { year: number; half: number; grade: string };

type Period = { year: number; half: number };

export function periodOfDate(date: Date): Period {
  return { year: date.getFullYear(), half: date.getMonth() < 6 ? 1 : 2 };
}

function comparePeriod(left: Period, right: Period) {
  return left.year - right.year || left.half - right.half;
}

export function computeReviewCFacts(
  reviews: ReviewPeriodGrade[],
  contractStartAt: Date | null,
  contractEndAt: Date | null,
): { hasTwoC: boolean | null; consecutiveTwoC: boolean | null; preRenewalC: boolean | null } {
  if (!contractStartAt) {
    return { hasTwoC: null, consecutiveTwoC: null, preRenewalC: null };
  }
  const sorted = [...reviews].sort((a, b) => comparePeriod(a, b));
  const start = periodOfDate(contractStartAt);
  const end = contractEndAt ? periodOfDate(contractEndAt) : null;
  const inContract = sorted.filter((review) =>
    comparePeriod(review, start) >= 0 && (!end || comparePeriod(review, end) <= 0));
  const preRenewal = sorted.filter((review) => comparePeriod(review, start) < 0);

  const hasTwoC = inContract.length === 0
    ? null
    : inContract.filter((review) => review.grade === "C").length >= 2;
  const consecutiveTwoC = inContract.length < 2
    ? null
    : inContract[inContract.length - 1].grade === "C" && inContract[inContract.length - 2].grade === "C";
  const preRenewalC = preRenewal.length === 0
    ? null
    : preRenewal[preRenewal.length - 1].grade === "C";
  return { hasTwoC, consecutiveTwoC, preRenewalC };
}
