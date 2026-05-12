import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { SubmitHandler } from 'react-hook-form'
import { trpc } from '../trpc'
import { Button } from '../components/Button'
import {
  FieldError,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from '../components/Input'
import {
  ACTION_LABELS,
  ACTION_TYPES,
  CONDITION_LABELS,
  ITEM_CONDITIONS,
  emptyRuleFormValues,
  ruleFormSchema,
} from './schema'
import type {
  ActionType,
  ConditionKey,
  RuleConditions,
  RuleFormValues,
} from './schema'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../server/router'

type RouterOutput = inferRouterOutputs<AppRouter>
type ExistingRule = RouterOutput['rules']['list'][number]

const NUMERIC_CONDITION_KEYS: ConditionKey[] = [
  'velocity24hLt',
  'velocity24hGt',
  'velocity7dLt',
  'velocity7dGt',
  'inventoryLt',
  'inventoryGt',
  'daysSinceListedGt',
]

function toFormDefaults(rule: ExistingRule | null): RuleFormValues {
  if (!rule) return emptyRuleFormValues()
  return {
    name: rule.name,
    description: rule.description ?? '',
    priority: rule.priority,
    enabled: rule.enabled,
    conditions: rule.conditions,
    action: rule.action,
  }
}

/**
 * The rules editor form. Owns its own form state (react-hook-form). The
 * caller passes either `null` (new rule) or an existing rule to edit.
 *
 * Validation is form-level on submit via the zod schema mirrored from the
 * server. We do not auto-save — managers commit explicitly.
 */
export function RuleForm({
  rule,
  onCancel,
  onSaved,
}: {
  rule: ExistingRule | null
  onCancel: () => void
  onSaved: () => void
}) {
  const utils = trpc.useUtils()
  const isEditing = rule !== null

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RuleFormValues>({
    defaultValues: toFormDefaults(rule),
    mode: 'onSubmit',
  })

  // Reset whenever the underlying rule changes (e.g. opening a different one).
  useEffect(() => {
    reset(toFormDefaults(rule))
  }, [rule, reset])

  const create = trpc.rules.create.useMutation({
    onSuccess: async () => {
      await utils.rules.list.invalidate()
      await utils.audit.list.invalidate()
      onSaved()
    },
  })
  const update = trpc.rules.update.useMutation({
    onSuccess: async () => {
      await utils.rules.list.invalidate()
      await utils.audit.list.invalidate()
      onSaved()
    },
  })

  const submit: SubmitHandler<RuleFormValues> = async (values) => {
    const parsed = ruleFormSchema.safeParse(values)
    if (!parsed.success) {
      // RHF will surface field-level errors via the resolver; this catches
      // shape errors not modeled per-field.
      return
    }
    if (isEditing && rule) {
      await update.mutateAsync({
        id: rule.id,
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        conditions: parsed.data.conditions,
        action: parsed.data.action,
        priority: parsed.data.priority,
        enabled: parsed.data.enabled,
      })
    } else {
      await create.mutateAsync({
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        conditions: parsed.data.conditions,
        action: parsed.data.action,
        priority: parsed.data.priority,
        enabled: parsed.data.enabled,
      })
    }
  }

  const conditions = watch('conditions')
  const actionType = watch('action.type')
  const activeConditionKeys = Object.keys(conditions) as ConditionKey[]

  const remove = (key: ConditionKey) => {
    const next = { ...conditions }
    delete next[key]
    setValue('conditions', next as RuleConditions, { shouldDirty: true })
  }

  const add = (key: ConditionKey) => {
    if (key in conditions) return
    const next: RuleConditions = { ...conditions }
    if (key === 'category') next.category = []
    else if (key === 'condition') next.condition = []
    else next[key] = 0
    setValue('conditions', next, { shouldDirty: true })
  }

  const setAction = (t: ActionType) => {
    if (t === 'multiply') setValue('action', { type: 'multiply', factor: 0.9 }, { shouldDirty: true })
    if (t === 'set') setValue('action', { type: 'set', valueCents: 1000 }, { shouldDirty: true })
    if (t === 'floor') setValue('action', { type: 'floor', minCents: 500 }, { shouldDirty: true })
    if (t === 'ceiling') setValue('action', { type: 'ceiling', maxCents: 5000 }, { shouldDirty: true })
  }

  const submitError = (create.error ?? update.error) as { message?: string } | null

  return (
    <form id="rule-form" onSubmit={handleSubmit(submit)} className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <FieldLabel htmlFor="rule-name" required>
            Name
          </FieldLabel>
          <Input
            id="rule-name"
            {...register('name', { required: 'Required' })}
            invalid={!!errors.name}
            placeholder="Mark down slow movers"
          />
          <FieldError message={errors.name?.message} />
        </div>

        <div className="md:col-span-2">
          <FieldLabel htmlFor="rule-description">Description</FieldLabel>
          <Textarea
            id="rule-description"
            {...register('description')}
            rows={2}
            placeholder="When inventory piles up and nothing's moving, drop the price 10%."
          />
        </div>

        <div>
          <FieldLabel htmlFor="rule-priority">
            Priority (lower wins)
          </FieldLabel>
          <Input
            id="rule-priority"
            type="number"
            step={1}
            {...register('priority', { valueAsNumber: true })}
            invalid={!!errors.priority}
          />
          <FieldError message={errors.priority?.message} />
        </div>

        <div className="flex items-center gap-2 pt-5">
          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Enabled
              </label>
            )}
          />
        </div>
      </div>

      <section className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
        <header className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Conditions
          </h3>
          <AddConditionPicker
            existing={activeConditionKeys}
            onAdd={add}
          />
        </header>
        {activeConditionKeys.length === 0 ? (
          <p className="text-xs text-slate-500">
            No conditions yet — add at least one. A rule with no conditions
            would match every item.
          </p>
        ) : (
          <ul className="space-y-2">
            {activeConditionKeys.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <span className="w-56 shrink-0 text-xs text-slate-600">
                  {CONDITION_LABELS[key]}
                </span>
                <ConditionInput
                  conditionKey={key}
                  value={conditions[key]}
                  onChange={(v) => {
                    const next = { ...conditions, [key]: v } as RuleConditions
                    setValue('conditions', next, { shouldDirty: true })
                  }}
                />
                <button
                  type="button"
                  onClick={() => remove(key)}
                  className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  aria-label={`Remove ${CONDITION_LABELS[key]} condition`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
        {errors.conditions ? (
          <FieldError
            message={
              typeof errors.conditions?.message === 'string'
                ? errors.conditions.message
                : 'Conditions are invalid'
            }
          />
        ) : null}
      </section>

      <section className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Action
        </h3>
        <div className="flex flex-wrap gap-3">
          {ACTION_TYPES.map((t) => (
            <label
              key={t}
              className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-xs ${
                actionType === t
                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <input
                type="radio"
                name="action.type"
                value={t}
                checked={actionType === t}
                onChange={() => setAction(t)}
                className="sr-only"
              />
              {ACTION_LABELS[t]}
            </label>
          ))}
        </div>
        <ActionValueInput
          type={actionType}
          register={register}
          errors={errors}
        />
      </section>

      {submitError ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {submitError.message ?? 'Save failed.'}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || (isEditing && !isDirty)}
        >
          {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : 'Create rule'}
        </Button>
      </div>
    </form>
  )
}

function AddConditionPicker({
  existing,
  onAdd,
}: {
  existing: ConditionKey[]
  onAdd: (k: ConditionKey) => void
}) {
  const available = (Object.keys(CONDITION_LABELS) as ConditionKey[]).filter(
    (k) => !existing.includes(k),
  )
  return (
    <select
      value=""
      onChange={(e) => {
        const v = e.target.value as ConditionKey | ''
        if (v) onAdd(v)
        e.currentTarget.selectedIndex = 0
      }}
      disabled={available.length === 0}
      className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      <option value="">
        {available.length === 0 ? 'All conditions added' : '+ Add condition'}
      </option>
      {available.map((k) => (
        <option key={k} value={k}>
          {CONDITION_LABELS[k]}
        </option>
      ))}
    </select>
  )
}

function ConditionInput({
  conditionKey,
  value,
  onChange,
}: {
  conditionKey: ConditionKey
  value: RuleConditions[ConditionKey]
  onChange: (v: RuleConditions[ConditionKey]) => void
}) {
  if (conditionKey === 'category') {
    const list = (value as string[] | undefined) ?? []
    return (
      <input
        type="text"
        value={list.join(', ')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="clothing, books"
        className="block w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
      />
    )
  }
  if (conditionKey === 'condition') {
    const list = (value as string[] | undefined) ?? []
    return (
      <div className="flex flex-wrap gap-1.5">
        {ITEM_CONDITIONS.map((c) => {
          const on = list.includes(c)
          return (
            <button
              type="button"
              key={c}
              onClick={() => {
                onChange(on ? list.filter((x) => x !== c) : [...list, c])
              }}
              className={`rounded px-2 py-0.5 text-xs ${
                on
                  ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                  : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50'
              }`}
            >
              {c.replace('_', ' ')}
            </button>
          )
        })}
      </div>
    )
  }
  // Numeric conditions.
  return (
    <input
      type="number"
      value={(value as number | undefined) ?? 0}
      onChange={(e) => {
        const n = e.target.value === '' ? 0 : Number(e.target.value)
        onChange(Number.isFinite(n) ? n : 0)
      }}
      step={
        conditionKey.includes('velocity') && !conditionKey.startsWith('days')
          ? 0.1
          : 1
      }
      min={0}
      className="block w-32 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
    />
  )
}

type RHFRegister = ReturnType<typeof useForm<RuleFormValues>>['register']
type RHFErrors = ReturnType<typeof useForm<RuleFormValues>>['formState']['errors']

function ActionValueInput({
  type,
  register,
  errors,
}: {
  type: ActionType
  register: RHFRegister
  errors: RHFErrors
}) {
  if (type === 'multiply') {
    return (
      <div>
        <FieldLabel>Factor (e.g. 0.9 = 10% off)</FieldLabel>
        <Input
          type="number"
          step={0.01}
          min={0.01}
          {...register('action.factor', { valueAsNumber: true })}
        />
        <FieldError
          message={
            errors.action && 'factor' in errors.action
              ? (errors.action as { factor?: { message?: string } }).factor?.message
              : undefined
          }
        />
      </div>
    )
  }
  const k =
    type === 'set' ? 'valueCents' : type === 'floor' ? 'minCents' : 'maxCents'
  return (
    <div>
      <FieldLabel>
        Value (cents — e.g. 1299 = $12.99)
      </FieldLabel>
      <Input
        type="number"
        step={1}
        min={1}
        {...register(`action.${k}` as const, { valueAsNumber: true })}
      />
    </div>
  )
}
