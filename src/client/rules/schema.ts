import { z } from 'zod'

/**
 * Client-side mirror of the server's `RuleConditions` / `RuleAction` schemas.
 *
 * Deliberately duplicated — the project is a demo, not a monorepo with shared
 * packages. The shape MUST match `src/server/db/schema/rules.ts` and the
 * validators in `src/server/routers/rules.ts`. Update both sides together.
 */

export const conditionKeys = [
  'velocity24hLt',
  'velocity24hGt',
  'velocity7dLt',
  'velocity7dGt',
  'inventoryLt',
  'inventoryGt',
  'daysSinceListedGt',
  'category',
  'condition',
] as const

export type ConditionKey = (typeof conditionKeys)[number]

export const CONDITION_LABELS: Record<ConditionKey, string> = {
  velocity24hLt: '24h velocity is less than',
  velocity24hGt: '24h velocity is greater than',
  velocity7dLt: '7d velocity is less than',
  velocity7dGt: '7d velocity is greater than',
  inventoryLt: 'inventory is less than',
  inventoryGt: 'inventory is greater than',
  daysSinceListedGt: 'days listed is greater than',
  category: 'category is one of',
  condition: 'condition is one of',
}

export const ITEM_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const
export type ItemCondition = (typeof ITEM_CONDITIONS)[number]

export const ruleConditionsSchema = z
  .object({
    velocity24hLt: z.number().nonnegative().optional(),
    velocity24hGt: z.number().nonnegative().optional(),
    velocity7dLt: z.number().nonnegative().optional(),
    velocity7dGt: z.number().nonnegative().optional(),
    inventoryLt: z.number().int().nonnegative().optional(),
    inventoryGt: z.number().int().nonnegative().optional(),
    daysSinceListedGt: z.number().int().nonnegative().optional(),
    category: z.array(z.string().min(1)).optional(),
    condition: z.array(z.enum(ITEM_CONDITIONS)).optional(),
  })
  .strict()

export const ACTION_TYPES = ['multiply', 'set', 'floor', 'ceiling'] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const ACTION_LABELS: Record<ActionType, string> = {
  multiply: 'Multiply current price by',
  set: 'Set price to (cents)',
  floor: 'Apply floor (cents)',
  ceiling: 'Apply ceiling (cents)',
}

export const ruleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('multiply'), factor: z.number().positive() }),
  z.object({ type: z.literal('set'), valueCents: z.number().int().min(1) }),
  z.object({ type: z.literal('floor'), minCents: z.number().int().min(1) }),
  z.object({ type: z.literal('ceiling'), maxCents: z.number().int().min(1) }),
])

export type RuleConditions = z.infer<typeof ruleConditionsSchema>
export type RuleAction = z.infer<typeof ruleActionSchema>

export const ruleFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  priority: z.number().int(),
  enabled: z.boolean(),
  conditions: ruleConditionsSchema.refine(
    (c) => Object.keys(c).length > 0,
    { message: 'Add at least one condition' },
  ),
  action: ruleActionSchema,
})

export type RuleFormValues = z.infer<typeof ruleFormSchema>

export const emptyRuleFormValues = (): RuleFormValues => ({
  name: '',
  description: '',
  priority: 100,
  enabled: true,
  conditions: {},
  // discriminated-union default — caller can swap with onChange
  action: { type: 'multiply', factor: 0.9 },
})
