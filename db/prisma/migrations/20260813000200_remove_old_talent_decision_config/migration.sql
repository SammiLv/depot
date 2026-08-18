-- 旧人才决策配置尚未投入使用，直接移除；人才决策历史批次和独立的工作事故/KPI规则不受影响。
DROP TABLE IF EXISTS "TalentDecisionRuleAction";
DROP TABLE IF EXISTS "TalentDecisionRuleCondition";
DROP TABLE IF EXISTS "TalentDecisionRuleVersion";
