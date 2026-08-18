-- 奖励限制仅保留“不限制、禁止奖励、人工复核”三种处理方式。
-- 旧的“限制奖励”和“取消奖励”统一归并为“禁止奖励”。
UPDATE "TalentRestrictionRuleOutput"
SET "handlingCode" = 'PROHIBIT'
WHERE "outputType" = 'REWARD_PROCESSING'
  AND "handlingCode" IN ('RESTRICT', 'CANCEL');
