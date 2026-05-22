import { SquaresFourIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye,
  EyeOff,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  SettingsCheckbox,
  SettingsField,
  SettingsInput,
  SettingsSelect,
  settingsFieldClassName,
  settingsIconButtonClassName,
  settingsMutedPanelClassName,
  settingsPrimaryButtonClassName,
  settingsSecondaryButtonClassName,
} from '@/components/ui-new/dialogs/settings/SettingsComponents';
import {
  MultiSelectDropdown,
  type MultiSelectDropdownOption,
} from '@/components/ui-new/primitives/MultiSelectDropdown';
import {
  useDiscoverCustomProviderModels,
  useValidateCustomProvider,
} from '@/hooks/useCliConfig';
import { cn } from '@/lib/utils';
import {
  createEmptyCustomProviderEntry,
  DEFAULT_CUSTOM_PROVIDER_NPM,
  normalizeCustomProviderEntry,
} from '@/types/cliConfig';
import type {
  CliModelInfo,
  CustomModelConfig,
  CustomProviderEntry,
  CustomProviderProbeRequest,
  CustomProviderProbeResponse,
} from '@/types/cliConfig';

const CUSTOM_NPM_OPTION_VALUE = '__custom__';
const MODALITY_VALUES = ['text', 'image'] as const;
const DEFAULT_MODEL_CONTEXT_LIMIT = 262144;
const DEFAULT_MODEL_OUTPUT_LIMIT = 32768;
const customProviderInlineActionButtonClassName =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-[#4B5563] transition-colors duration-200 hover:bg-[#EEF2F6] hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#9AA8BD] dark:hover:bg-[#263244] dark:hover:text-[#F3F6FB]';
const customProviderInlineActionIconClassName = 'h-3.5 w-3.5';

type ModalityValue = (typeof MODALITY_VALUES)[number];

type CustomModelDraft = {
  contextLimit: string;
  id: string;
  inputModalities: ModalityValue[];
  key: string;
  name: string;
  options: CustomModelConfig['options'];
  outputLimit: string;
  outputModalities: ModalityValue[];
  thinkingBudget: string;
  thinkingEnabled: boolean;
};

type CustomProviderFormState = {
  apiKey: string;
  baseURL: string;
  id: string;
  models: CustomModelDraft[];
  name: string;
  npm: string;
  timeout: string;
};

type CustomProviderFormProps = {
  initialProvider: CustomProviderEntry | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: CustomProviderEntry) => Promise<void>;
  open: boolean;
};

type StatusState = {
  message: string;
  tone: 'error' | 'success' | 'warning';
  title?: string;
} | null;

type ModelTestState = {
  message: string;
  status: 'failed' | 'success' | 'unsupported';
} | null;

const AI_SDK_NPM_PACKAGES = [
  { value: '@ai-sdk/amazon-bedrock', label: 'Amazon Bedrock' },
  { value: '@ai-sdk/anthropic', label: 'Anthropic' },
  { value: '@ai-sdk/azure', label: 'Azure OpenAI' },
  { value: '@ai-sdk/cerebras', label: 'Cerebras' },
  { value: '@ai-sdk/cohere', label: 'Cohere' },
  { value: '@ai-sdk/deepinfra', label: 'DeepInfra' },
  { value: '@ai-sdk/gateway', label: 'AI Gateway' },
  { value: '@ai-sdk/google', label: 'Google AI' },
  { value: '@ai-sdk/google-vertex', label: 'Google Vertex' },
  { value: '@ai-sdk/groq', label: 'Groq' },
  { value: '@ai-sdk/mistral', label: 'Mistral' },
  { value: '@ai-sdk/openai', label: 'OpenAI' },
  { value: '@ai-sdk/openai-compatible', label: 'OpenAI Compatible' },
  { value: '@ai-sdk/perplexity', label: 'Perplexity' },
  { value: '@ai-sdk/togetherai', label: 'Together AI' },
  { value: '@ai-sdk/vercel', label: 'Vercel AI' },
  { value: '@ai-sdk/xai', label: 'xAI' },
  { value: '@openrouter/ai-sdk-provider', label: 'OpenRouter' },
  { value: '@gitlab/gitlab-ai-provider', label: 'GitLab AI' },
  { value: 'ai-gateway-provider', label: 'AI Gateway Provider' },
] as const;

let modelDraftCounter = 0;

function createModelDraftKey() {
  modelDraftCounter += 1;
  return `custom-model-${modelDraftCounter}`;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isOptionsObject(value: CustomModelConfig['options']): boolean {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function parseStoredModalities(
  values: string[] | null | undefined
): ModalityValue[] {
  return MODALITY_VALUES.filter((value) => values?.includes(value));
}

function parseSelectedModalities(
  values: ModalityValue[]
): ModalityValue[] | null {
  return values.length > 0 ? values : null;
}

function extractThinkingState(options: CustomModelConfig['options']) {
  if (!isOptionsObject(options)) {
    return {
      thinkingBudget: '',
      thinkingEnabled: false,
    };
  }

  const thinking = (options as Record<string, unknown>).thinking;
  const thinkingRecord =
    thinking && typeof thinking === 'object' && !Array.isArray(thinking)
      ? (thinking as Record<string, unknown>)
      : null;

  if (!thinkingRecord || thinkingRecord.type !== 'enabled') {
    return {
      thinkingBudget: '',
      thinkingEnabled: false,
    };
  }

  return {
    thinkingBudget:
      typeof thinkingRecord.budgetTokens === 'number' &&
      Number.isFinite(thinkingRecord.budgetTokens)
        ? String(thinkingRecord.budgetTokens)
        : '',
    thinkingEnabled: true,
  };
}

function buildModelOptions(
  model: CustomModelDraft
): CustomModelConfig['options'] {
  const baseOptions = isOptionsObject(model.options)
    ? Object.fromEntries(
        Object.entries(model.options as Record<string, unknown>).filter(
          ([key]) => key !== 'thinking'
        )
      )
    : {};

  if (!model.thinkingEnabled) {
    return Object.keys(baseOptions).length > 0
      ? (baseOptions as CustomModelConfig['options'])
      : null;
  }

  const thinkingBudget = parseOptionalInteger(model.thinkingBudget);
  if (thinkingBudget == null) {
    throw new Error('thinking-budget-required');
  }

  return {
    ...baseOptions,
    thinking: {
      type: 'enabled',
      budgetTokens: thinkingBudget,
    },
  } as CustomModelConfig['options'];
}

function createEmptyModelDraft(): CustomModelDraft {
  return {
    contextLimit: '',
    id: '',
    inputModalities: [],
    key: createModelDraftKey(),
    name: '',
    options: null,
    outputLimit: '',
    outputModalities: [],
    thinkingBudget: '9216',
    thinkingEnabled: true,
  };
}

function createModelDraft(
  id: string,
  model: CustomModelConfig
): CustomModelDraft {
  const thinkingState = extractThinkingState(model.options);

  return {
    contextLimit:
      model.limit?.context == null ? '' : String(model.limit.context),
    id,
    inputModalities: parseStoredModalities(model.modalities?.input),
    key: createModelDraftKey(),
    name: model.name ?? '',
    options: model.options ?? null,
    outputLimit: model.limit?.output == null ? '' : String(model.limit.output),
    outputModalities: parseStoredModalities(model.modalities?.output),
    thinkingBudget: thinkingState.thinkingBudget,
    thinkingEnabled: thinkingState.thinkingEnabled,
  };
}

function createFormState(
  entry: CustomProviderEntry | null | undefined
): CustomProviderFormState {
  const provider = entry ?? createEmptyCustomProviderEntry();

  return {
    apiKey: provider.options.api_key ?? '',
    baseURL: provider.options.baseURL ?? '',
    id: provider.id,
    models: Object.entries(provider.models ?? {}).map(([modelId, model]) =>
      createModelDraft(modelId, model)
    ),
    name: provider.name ?? '',
    npm: provider.npm ?? DEFAULT_CUSTOM_PROVIDER_NPM,
    timeout:
      provider.options.timeout == null ? '' : String(provider.options.timeout),
  };
}

function parseOptionalInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('invalid-integer');
  }

  return parsed;
}

function isBuiltInNpmPackage(value: string): boolean {
  return AI_SDK_NPM_PACKAGES.some((entry) => entry.value === value);
}

function getNpmSelectionValue(value: string): string {
  return isBuiltInNpmPackage(value) ? value : CUSTOM_NPM_OPTION_VALUE;
}

function formatModalitiesTriggerLabel(
  values: ModalityValue[],
  options: MultiSelectDropdownOption<ModalityValue>[],
  placeholder: string
) {
  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);

  return selectedLabels.length > 0 ? selectedLabels.join(' / ') : placeholder;
}

function renderStatusMessage(status: StatusState) {
  if (!status) {
    return null;
  }

  const toneClassName =
    status.tone === 'success'
      ? 'border-[#d8ead8] bg-[#f7fcf7] text-[#2f7d32] dark:border-[rgba(74,222,128,0.2)] dark:bg-[rgba(34,197,94,0.12)] dark:text-[#86EFAC]'
      : status.tone === 'warning'
        ? 'border-[#f6dfb7] bg-[#fffaf0] text-[#9a5b00] dark:border-[rgba(251,191,36,0.26)] dark:bg-[rgba(245,158,11,0.12)] dark:text-[#FCD34D]'
        : 'border-[#f3d7d7] bg-[#fff7f7] text-[#d14343] dark:border-[rgba(248,113,113,0.24)] dark:bg-[rgba(239,68,68,0.12)] dark:text-[#FCA5A5]';

  return (
    <div
      className={cn(
        'mb-5 rounded-[10px] border p-4 text-[13px]',
        toneClassName
      )}
    >
      {status.title ? <p className="mb-1 font-medium">{status.title}</p> : null}
      <p>{status.message}</p>
    </div>
  );
}

function createDiscoveredModelDraft(model: CliModelInfo): CustomModelDraft {
  const draft = createEmptyModelDraft();
  return {
    ...draft,
    id: model.id,
    name: model.name || model.id,
  };
}

function mergeDiscoveredModels(
  currentModels: CustomModelDraft[],
  discoveredModels: CliModelInfo[]
) {
  const existingIds = new Set(
    currentModels.map((model) => model.id.trim()).filter(Boolean)
  );
  const discoveredIds = new Set<string>();
  const modelsToAdd: CustomModelDraft[] = [];

  for (const discoveredModel of discoveredModels) {
    const modelId = discoveredModel.id.trim();
    if (!modelId || existingIds.has(modelId) || discoveredIds.has(modelId)) {
      continue;
    }

    discoveredIds.add(modelId);
    modelsToAdd.push(
      createDiscoveredModelDraft({
        ...discoveredModel,
        id: modelId,
        name: discoveredModel.name.trim() || modelId,
      })
    );
  }

  return {
    addedCount: modelsToAdd.length,
    models: [...currentModels, ...modelsToAdd],
  };
}

export function CustomProviderForm({
  initialProvider,
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
}: CustomProviderFormProps) {
  const { t } = useTranslation(['settings', 'common']);
  const discoverCustomProviderModels = useDiscoverCustomProviderModels();
  const validateCustomProvider = useValidateCustomProvider();
  const validateCustomProviderModel = useValidateCustomProvider();
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<CustomProviderFormState>(() =>
    createFormState(initialProvider)
  );
  const [npmSelection, setNpmSelection] = useState<string>(() =>
    getNpmSelectionValue(initialProvider?.npm ?? DEFAULT_CUSTOM_PROVIDER_NPM)
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [validationStatus, setValidationStatus] = useState<StatusState>(null);
  const [modelTestStatuses, setModelTestStatuses] = useState<
    Record<string, ModelTestState>
  >({});
  const [pendingModelTestKey, setPendingModelTestKey] = useState<string | null>(
    null
  );
  const pendingScrollModelKeyRef = useRef<string | null>(null);
  const modelCardRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setShowApiKey(false);
    setValidationStatus(null);
    setModelTestStatuses({});
    setPendingModelTestKey(null);
    pendingScrollModelKeyRef.current = null;
    const nextFormState = createFormState(initialProvider);
    setFormState(nextFormState);
    setNpmSelection(getNpmSelectionValue(nextFormState.npm));
  }, [initialProvider, open]);

  useEffect(() => {
    const modelKey = pendingScrollModelKeyRef.current;
    if (!modelKey) return;

    const cardElement = modelCardRefs.current.get(modelKey);
    if (!cardElement) return;

    pendingScrollModelKeyRef.current = null;
    cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.requestAnimationFrame(() => {
      cardElement.querySelector('input')?.focus();
    });
  }, [formState.models]);

  const isEditing = initialProvider != null;
  const apiKeyMasked = formState.apiKey.includes('***');
  const hasModels = formState.models.length > 0;

  const dialogCopy = useMemo(
    () => ({
      description: isEditing
        ? t('settings.cli.customProviders.form.editDescription')
        : t('settings.cli.customProviders.form.createDescription'),
      submitLabel: isEditing
        ? t('settings.cli.customProviders.form.update')
        : t('settings.cli.customProviders.form.create'),
      title: isEditing
        ? t('settings.cli.customProviders.form.editTitle')
        : t('settings.cli.customProviders.form.createTitle'),
    }),
    [isEditing, t]
  );
  const npmOptions = useMemo(
    () => [
      ...AI_SDK_NPM_PACKAGES.map((entry) => ({
        value: entry.value,
        label: entry.label,
      })),
      { value: CUSTOM_NPM_OPTION_VALUE, label: 'Custom' },
    ],
    []
  );
  const modalityOptions = useMemo(
    () =>
      MODALITY_VALUES.map((value) => ({
        value,
        label: t(`settings.cli.customProviders.form.modalities.${value}`),
      })) satisfies MultiSelectDropdownOption<ModalityValue>[],
    [t]
  );

  const updateFormState = (
    updater: (current: CustomProviderFormState) => CustomProviderFormState
  ) => {
    setFormState((current) => updater(current));
    setError(null);
    setValidationStatus(null);
    setModelTestStatuses({});
  };

  const updateModelDraft = (
    key: string,
    updater: (draft: CustomModelDraft) => CustomModelDraft
  ) => {
    updateFormState((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.key === key ? updater(model) : model
      ),
    }));
  };

  const formatProbeMessage = (
    response: CustomProviderProbeResponse,
    fallback: string
  ) => {
    if (response.status === 'unsupported') {
      return t('settings.cli.customProviders.form.autoUnsupported');
    }

    const lowerMessage = response.message.toLowerCase();
    if (
      lowerMessage.includes('authentication') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('401') ||
      lowerMessage.includes('403')
    ) {
      return t('settings.cli.customProviders.form.authFailed');
    }

    if (lowerMessage.includes('no models')) {
      return t('settings.cli.customProviders.form.noDiscoveredModels');
    }

    return response.message || fallback;
  };

  const buildProbeRequest = (
    modelId?: string
  ): CustomProviderProbeRequest | null => {
    const baseURL = trimToNull(formState.baseURL);
    if (!baseURL) {
      setValidationStatus({
        message: t(
          'settings.cli.customProviders.form.validation.baseUrlRequired'
        ),
        tone: 'error',
        title: t('settings.cli.validation.failureTitle'),
      });
      return null;
    }

    try {
      return {
        id: formState.id.trim(),
        model_id: trimToNull(modelId),
        npm: trimToNull(formState.npm),
        options: {
          api_key: apiKeyMasked ? null : trimToNull(formState.apiKey),
          baseURL,
          timeout: parseOptionalInteger(formState.timeout),
        },
      };
    } catch (probeError) {
      if (
        probeError instanceof Error &&
        probeError.message === 'invalid-integer'
      ) {
        setValidationStatus({
          message: t(
            'settings.cli.customProviders.form.validation.numericLimit'
          ),
          tone: 'error',
          title: t('settings.cli.validation.failureTitle'),
        });
        return null;
      }

      throw probeError;
    }
  };

  const handleDiscoverModels = async () => {
    const request = buildProbeRequest();
    if (!request) {
      return;
    }

    try {
      const response = await discoverCustomProviderModels.mutateAsync(request);

      if (response.status === 'unsupported') {
        setValidationStatus({
          message: formatProbeMessage(
            response,
            t('settings.cli.customProviders.form.autoUnsupported')
          ),
          tone: 'warning',
          title: t(
            'settings.cli.customProviders.form.protocolUnsupportedTitle'
          ),
        });
        return;
      }

      if (!response.valid || response.status === 'failed') {
        setValidationStatus({
          message: formatProbeMessage(
            response,
            t('settings.cli.customProviders.form.fetchFailed')
          ),
          tone: 'error',
          title: t('settings.cli.customProviders.form.fetchFailedTitle'),
        });
        return;
      }

      if (response.models.length === 0) {
        setValidationStatus({
          message: t('settings.cli.customProviders.form.noDiscoveredModels'),
          tone: 'warning',
          title: t('settings.cli.customProviders.form.noDiscoveredModelsTitle'),
        });
        return;
      }

      const previewMerge = mergeDiscoveredModels(
        formState.models,
        response.models
      );
      setFormState((current) => {
        const merged = mergeDiscoveredModels(current.models, response.models);
        return {
          ...current,
          models: merged.models,
        };
      });
      setError(null);
      setValidationStatus({
        message: t('settings.cli.customProviders.form.fetchSuccess', {
          added: previewMerge.addedCount,
          count: response.models.length,
        }),
        tone: 'success',
        title: t('settings.cli.customProviders.form.fetchSuccessTitle'),
      });
    } catch (discoveryError) {
      setValidationStatus({
        message:
          discoveryError instanceof Error
            ? discoveryError.message
            : t('settings.cli.customProviders.form.fetchFailed'),
        tone: 'error',
        title: t('settings.cli.customProviders.form.fetchFailedTitle'),
      });
    }
  };

  const handleValidateBaseUrl = async () => {
    const request = buildProbeRequest();
    if (!request) {
      return;
    }

    try {
      const response = await validateCustomProvider.mutateAsync(request);

      if (response.status === 'unsupported') {
        setValidationStatus({
          message: formatProbeMessage(
            response,
            t('settings.cli.customProviders.form.autoUnsupported')
          ),
          tone: 'warning',
          title: t(
            'settings.cli.customProviders.form.protocolUnsupportedTitle'
          ),
        });
        return;
      }

      setValidationStatus({
        message: formatProbeMessage(
          response,
          response.valid
            ? t('settings.cli.validation.successTitle')
            : t('settings.cli.validation.error')
        ),
        tone: response.valid ? 'success' : 'error',
        title: response.valid
          ? t('settings.cli.validation.successTitle')
          : t('settings.cli.validation.failureTitle'),
      });
    } catch (validationError) {
      setValidationStatus({
        message:
          validationError instanceof Error
            ? validationError.message
            : t('settings.cli.validation.error'),
        tone: 'error',
        title: t('settings.cli.validation.failureTitle'),
      });
    }
  };

  const handleValidateModel = async (model: CustomModelDraft) => {
    const modelId = model.id.trim();
    if (!modelId) {
      setModelTestStatuses((current) => ({
        ...current,
        [model.key]: {
          message: t(
            'settings.cli.customProviders.form.validation.modelIdRequired'
          ),
          status: 'failed',
        },
      }));
      return;
    }

    const request = buildProbeRequest(modelId);
    if (!request) {
      return;
    }

    setPendingModelTestKey(model.key);
    setModelTestStatuses((current) => ({
      ...current,
      [model.key]: null,
    }));

    try {
      const response = await validateCustomProviderModel.mutateAsync(request);
      const status =
        response.status === 'unsupported'
          ? 'unsupported'
          : response.valid
            ? 'success'
            : 'failed';

      setModelTestStatuses((current) => ({
        ...current,
        [model.key]: {
          message:
            status === 'success'
              ? t('settings.cli.customProviders.form.modelTestSuccess', {
                  id: modelId,
                })
              : formatProbeMessage(
                  response,
                  t('settings.cli.customProviders.form.modelTestFailed')
                ),
          status,
        },
      }));
    } catch (modelTestError) {
      setModelTestStatuses((current) => ({
        ...current,
        [model.key]: {
          message:
            modelTestError instanceof Error
              ? modelTestError.message
              : t('settings.cli.customProviders.form.modelTestFailed'),
          status: 'failed',
        },
      }));
    } finally {
      setPendingModelTestKey(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const providerId = formState.id.trim();
    if (!providerId) {
      setError(
        t('settings.cli.customProviders.form.validation.providerIdRequired')
      );
      return;
    }

    if (!formState.baseURL.trim()) {
      setError(
        t('settings.cli.customProviders.form.validation.baseUrlRequired')
      );
      return;
    }

    const modelsRecord: Record<string, CustomModelConfig> = {};
    const seenModelIds = new Set<string>();

    try {
      for (const model of formState.models) {
        const modelId = model.id.trim();
        if (!modelId) {
          setError(
            t('settings.cli.customProviders.form.validation.modelIdRequired')
          );
          return;
        }

        const modelName = model.name.trim();
        if (!modelName) {
          setError(
            t('settings.cli.customProviders.form.validation.modelNameRequired')
          );
          return;
        }

        if (seenModelIds.has(modelId)) {
          setError(
            t('settings.cli.customProviders.form.validation.duplicateModelId', {
              id: modelId,
            })
          );
          return;
        }
        seenModelIds.add(modelId);

        const contextLimit = parseOptionalInteger(model.contextLimit);
        const outputLimit = parseOptionalInteger(model.outputLimit);

        modelsRecord[modelId] = {
          limit: {
            context: contextLimit ?? DEFAULT_MODEL_CONTEXT_LIMIT,
            output: outputLimit ?? DEFAULT_MODEL_OUTPUT_LIMIT,
          },
          modalities: {
            input: parseSelectedModalities(model.inputModalities),
            output: parseSelectedModalities(model.outputModalities),
          },
          name: modelName,
          options: buildModelOptions(model),
        };
      }

      const provider = normalizeCustomProviderEntry({
        id: providerId,
        models: Object.keys(modelsRecord).length > 0 ? modelsRecord : null,
        name: formState.name.trim() || null,
        npm: formState.npm.trim() || DEFAULT_CUSTOM_PROVIDER_NPM,
        options: {
          api_key: formState.apiKey.trim() || null,
          baseURL: formState.baseURL.trim() || null,
          timeout: parseOptionalInteger(formState.timeout),
        },
      });

      await onSubmit(provider);
      onOpenChange(false);
    } catch (submitError) {
      if (
        submitError instanceof Error &&
        submitError.message === 'thinking-budget-required'
      ) {
        setError(
          t(
            'settings.cli.customProviders.form.validation.thinkingBudgetRequired'
          )
        );
        return;
      }

      if (
        submitError instanceof Error &&
        submitError.message === 'invalid-integer'
      ) {
        setError(
          t('settings.cli.customProviders.form.validation.numericLimit')
        );
        return;
      }

      setError(
        submitError instanceof Error
          ? submitError.message
          : t('settings.cli.customProviders.form.submitError')
      );
    }
  };

  return (
    <Dialog
      onOpenChange={onOpenChange}
      open={open}
      hideCloseButton
      overlayClassName="bg-black/5 dark:bg-black/55"
      containerClassName="items-center p-4 md:p-6"
      className="my-0 w-full max-w-[720px] max-h-[min(640px,calc(100vh-48px))] gap-0 overflow-hidden rounded-[16px] border border-[#E8EEF5] bg-white p-0 shadow-[0_20px_60px_rgba(0,0,0,0.1)] dark:border-[#2B3648] dark:bg-[#111926] dark:shadow-[0_24px_72px_rgba(0,0,0,0.45)]"
    >
      <DialogContent className="min-h-0 gap-0">
        <DialogHeader className="border-b border-[#E8EEF5] px-6 py-5 text-left dark:border-[#2B3648] dark:bg-[#111926]">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <DialogTitle className="text-[18px] font-semibold text-[#333333] dark:text-[#F3F6FB]">
                {dialogCopy.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-[13px] leading-6 text-[#8C8C8C] dark:text-[#7F8AA3]">
                {dialogCopy.description}
              </DialogDescription>
            </div>
            <button
              type="button"
              className={settingsIconButtonClassName}
              onClick={() => onOpenChange(false)}
              aria-label={t('close', { ns: 'common', defaultValue: 'Close' })}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-6 dark:bg-[#111926]">
            {error
              ? renderStatusMessage({
                  message: error,
                  tone: 'error',
                  title: t('settings.cli.customProviders.form.errorTitle'),
                })
              : null}
            {renderStatusMessage(validationStatus)}

            <div className="space-y-8">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <SettingsField
                    label={t('settings.cli.customProviders.form.idLabel')}
                    description={t(
                      'settings.cli.customProviders.form.idHelper'
                    )}
                  >
                    <SettingsInput
                      disabled={isEditing}
                      value={formState.id}
                      onChange={(value) =>
                        updateFormState((current) => ({
                          ...current,
                          id: value,
                        }))
                      }
                      placeholder={t(
                        'settings.cli.customProviders.form.idPlaceholder'
                      )}
                    />
                  </SettingsField>

                  <SettingsField
                    label={t('settings.cli.customProviders.form.nameLabel')}
                  >
                    <SettingsInput
                      value={formState.name}
                      onChange={(value) =>
                        updateFormState((current) => ({
                          ...current,
                          name: value,
                        }))
                      }
                      placeholder={t(
                        'settings.cli.customProviders.form.namePlaceholder'
                      )}
                    />
                  </SettingsField>
                </div>

                <SettingsField
                  label={t('settings.cli.customProviders.form.baseUrlLabel')}
                >
                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="min-w-0 flex-1">
                      <SettingsInput
                        value={formState.baseURL}
                        onChange={(value) =>
                          updateFormState((current) => ({
                            ...current,
                            baseURL: value,
                          }))
                        }
                        placeholder={t(
                          'settings.cli.customProviders.form.baseUrlPlaceholder'
                        )}
                      />
                    </div>
                    <button
                      type="button"
                      className={cn(
                        settingsSecondaryButtonClassName,
                        'shrink-0 whitespace-nowrap'
                      )}
                      onClick={handleValidateBaseUrl}
                      disabled={validateCustomProvider.isPending}
                    >
                      {validateCustomProvider.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {validateCustomProvider.isPending
                        ? t('settings.cli.validation.testing')
                        : t('settings.cli.validation.button')}
                    </button>
                  </div>
                </SettingsField>

                <SettingsField
                  label={t('settings.cli.customProviders.form.apiKeyLabel')}
                  description={
                    apiKeyMasked
                      ? t('settings.cli.customProviders.form.apiKeyMasked')
                      : undefined
                  }
                >
                  <div className="flex gap-2">
                    <input
                      id="custom-provider-api-key"
                      type={showApiKey ? 'text' : 'password'}
                      className={cn(settingsFieldClassName, 'flex-1')}
                      placeholder={t(
                        'settings.cli.customProviders.form.apiKeyPlaceholder'
                      )}
                      value={formState.apiKey}
                      onChange={(event) =>
                        updateFormState((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className={settingsIconButtonClassName}
                      onClick={() => setShowApiKey((visible) => !visible)}
                      aria-label={t(
                        'settings.cli.customProviders.form.apiKeyLabel'
                      )}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </SettingsField>

                <div className="grid gap-4 md:grid-cols-2">
                  <SettingsField
                    label={t('settings.cli.customProviders.form.npmLabel')}
                    description={t(
                      'settings.cli.customProviders.form.npmHelper'
                    )}
                  >
                    <SettingsSelect
                      value={npmSelection}
                      options={npmOptions}
                      onChange={(value) => {
                        setNpmSelection(value);
                        updateFormState((current) => ({
                          ...current,
                          npm:
                            value === CUSTOM_NPM_OPTION_VALUE
                              ? isBuiltInNpmPackage(current.npm)
                                ? ''
                                : current.npm
                              : value,
                        }));
                      }}
                      placeholder={t(
                        'settings.cli.customProviders.form.npmPlaceholder'
                      )}
                    />
                    {npmSelection === CUSTOM_NPM_OPTION_VALUE ? (
                      <input
                        type="text"
                        className={cn(settingsFieldClassName, 'mt-3')}
                        placeholder={t(
                          'settings.cli.customProviders.form.npmPlaceholder'
                        )}
                        value={formState.npm}
                        onChange={(event) =>
                          updateFormState((current) => ({
                            ...current,
                            npm: event.target.value,
                          }))
                        }
                      />
                    ) : null}
                  </SettingsField>

                  <SettingsField
                    label={t('settings.cli.customProviders.form.timeoutLabel')}
                  >
                    <input
                      id="custom-provider-timeout"
                      type="number"
                      min="0"
                      className={settingsFieldClassName}
                      placeholder={t(
                        'settings.cli.customProviders.form.timeoutPlaceholder'
                      )}
                      value={formState.timeout}
                      onChange={(event) =>
                        updateFormState((current) => ({
                          ...current,
                          timeout: event.target.value,
                        }))
                      }
                    />
                  </SettingsField>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[14px] font-semibold text-[#333333] dark:text-[#F3F6FB]">
                      {t('settings.cli.customProviders.form.modelsTitle')}
                    </h4>
                    <p className="mt-2 text-[12px] leading-5 text-[#8C8C8C] dark:text-[#7F8AA3]">
                      {t('settings.cli.customProviders.form.modelsDescription')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      className={customProviderInlineActionButtonClassName}
                      onClick={handleDiscoverModels}
                      disabled={discoverCustomProviderModels.isPending}
                    >
                      {discoverCustomProviderModels.isPending ? (
                        <Loader2
                          className={cn(
                            customProviderInlineActionIconClassName,
                            'animate-spin'
                          )}
                        />
                      ) : (
                        <RefreshCw
                          className={customProviderInlineActionIconClassName}
                        />
                      )}
                      {discoverCustomProviderModels.isPending
                        ? t('settings.cli.customProviders.form.fetchingModels')
                        : t('settings.cli.customProviders.form.fetchModels')}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        settingsSecondaryButtonClassName,
                        'shrink-0 whitespace-nowrap'
                      )}
                      onClick={() => {
                        const nextModel = createEmptyModelDraft();
                        pendingScrollModelKeyRef.current = nextModel.key;
                        updateFormState((current) => ({
                          ...current,
                          models: [...current.models, nextModel],
                        }));
                      }}
                    >
                      <Plus className="h-4 w-4" />
                      {t('settings.cli.customProviders.form.addModel')}
                    </button>
                  </div>
                </div>

                {!hasModels ? (
                  <div
                    className={cn(
                      settingsMutedPanelClassName,
                      'border-dashed p-4 text-[13px] text-[#8C8C8C]'
                    )}
                  >
                    {t('settings.cli.customProviders.form.noModels')}
                  </div>
                ) : null}

                <div className="space-y-4">
                  {formState.models.map((model) => (
                    <div
                      key={model.key}
                      ref={(element) => {
                        if (element) {
                          modelCardRefs.current.set(model.key, element);
                        } else {
                          modelCardRefs.current.delete(model.key);
                        }
                      }}
                      className={cn(settingsMutedPanelClassName, 'p-4')}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <p className="min-w-0 flex-1 text-[14px] font-medium text-[#333333]">
                          {model.name ||
                            model.id ||
                            t('settings.cli.customProviders.form.newModel')}
                        </p>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            className={
                              customProviderInlineActionButtonClassName
                            }
                            onClick={() => handleValidateModel(model)}
                            disabled={pendingModelTestKey === model.key}
                          >
                            {pendingModelTestKey === model.key ? (
                              <Loader2
                                className={cn(
                                  customProviderInlineActionIconClassName,
                                  'animate-spin'
                                )}
                              />
                            ) : (
                              <Play
                                className={
                                  customProviderInlineActionIconClassName
                                }
                              />
                            )}
                            {pendingModelTestKey === model.key
                              ? t(
                                  'settings.cli.customProviders.form.testingModel'
                                )
                              : t(
                                  'settings.cli.customProviders.form.testModel'
                                )}
                          </button>
                          <button
                            type="button"
                            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-[#f3d7d7] bg-[#fff7f7] px-3 py-[9px] text-[13px] text-[#d14343] transition-colors duration-200 hover:bg-[#fdeeee] dark:border-[rgba(248,113,113,0.24)] dark:bg-[rgba(239,68,68,0.12)] dark:text-[#FCA5A5] dark:hover:bg-[rgba(239,68,68,0.18)]"
                            onClick={() =>
                              updateFormState((current) => ({
                                ...current,
                                models: current.models.filter(
                                  (entry) => entry.key !== model.key
                                ),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                            {t(
                              'settings.cli.customProviders.actions.removeModel'
                            )}
                          </button>
                        </div>
                      </div>

                      {modelTestStatuses[model.key] ? (
                        <div
                          className={cn(
                            'mt-3 rounded-[10px] border px-3 py-2 text-[12px] leading-5',
                            modelTestStatuses[model.key]?.status === 'success'
                              ? 'border-[#d8ead8] bg-[#f7fcf7] text-[#2f7d32] dark:border-[rgba(74,222,128,0.2)] dark:bg-[rgba(34,197,94,0.12)] dark:text-[#86EFAC]'
                              : modelTestStatuses[model.key]?.status ===
                                  'unsupported'
                                ? 'border-[#f6dfb7] bg-[#fffaf0] text-[#9a5b00] dark:border-[rgba(251,191,36,0.26)] dark:bg-[rgba(245,158,11,0.12)] dark:text-[#FCD34D]'
                                : 'border-[#f3d7d7] bg-[#fff7f7] text-[#d14343] dark:border-[rgba(248,113,113,0.24)] dark:bg-[rgba(239,68,68,0.12)] dark:text-[#FCA5A5]'
                          )}
                        >
                          {modelTestStatuses[model.key]?.message}
                        </div>
                      ) : null}

                      <div className="mt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <SettingsField
                            label={t(
                              'settings.cli.customProviders.form.modelIdLabel'
                            )}
                          >
                            <SettingsInput
                              value={model.id}
                              onChange={(value) =>
                                updateModelDraft(model.key, (draft) => ({
                                  ...draft,
                                  id: value,
                                }))
                              }
                              placeholder={t(
                                'settings.cli.customProviders.form.modelIdPlaceholder'
                              )}
                            />
                          </SettingsField>

                          <SettingsField
                            label={t(
                              'settings.cli.customProviders.form.modelNameLabel'
                            )}
                          >
                            <SettingsInput
                              value={model.name}
                              onChange={(value) =>
                                updateModelDraft(model.key, (draft) => ({
                                  ...draft,
                                  name: value,
                                }))
                              }
                              placeholder={t(
                                'settings.cli.customProviders.form.modelNamePlaceholder'
                              )}
                            />
                          </SettingsField>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <SettingsField
                            label={t(
                              'settings.cli.customProviders.form.inputModalitiesLabel'
                            )}
                          >
                            <MultiSelectDropdown
                              values={model.inputModalities}
                              options={modalityOptions}
                              icon={SquaresFourIcon}
                              label={formatModalitiesTriggerLabel(
                                model.inputModalities,
                                modalityOptions,
                                t(
                                  'settings.cli.customProviders.form.modalitiesPlaceholder'
                                )
                              )}
                              menuLabel={t(
                                'settings.cli.customProviders.form.inputModalitiesLabel'
                              )}
                              triggerClassName={cn(
                                settingsFieldClassName,
                                'w-full justify-between gap-2 rounded-[10px] bg-[#F9FBFF] px-[14px] py-[10px] text-[14px] text-[#333333] hover:bg-white dark:bg-[#0F1724] dark:text-[#F3F6FB] dark:hover:bg-[#111926]'
                              )}
                              menuContentClassName="w-[var(--radix-dropdown-menu-trigger-width)] rounded-[10px] border border-[#E8EEF5] bg-white p-1 shadow-[0_12px_30px_rgba(0,0,0,0.08)] dark:border-[#2B3648] dark:bg-[#192233] dark:shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
                              onChange={(values) =>
                                updateModelDraft(model.key, (draft) => ({
                                  ...draft,
                                  inputModalities: values,
                                }))
                              }
                            />
                          </SettingsField>

                          <SettingsField
                            label={t(
                              'settings.cli.customProviders.form.outputModalitiesLabel'
                            )}
                          >
                            <MultiSelectDropdown
                              values={model.outputModalities}
                              options={modalityOptions}
                              icon={SquaresFourIcon}
                              label={formatModalitiesTriggerLabel(
                                model.outputModalities,
                                modalityOptions,
                                t(
                                  'settings.cli.customProviders.form.modalitiesPlaceholder'
                                )
                              )}
                              menuLabel={t(
                                'settings.cli.customProviders.form.outputModalitiesLabel'
                              )}
                              triggerClassName={cn(
                                settingsFieldClassName,
                                'w-full justify-between gap-2 rounded-[10px] bg-[#F9FBFF] px-[14px] py-[10px] text-[14px] text-[#333333] hover:bg-white dark:bg-[#0F1724] dark:text-[#F3F6FB] dark:hover:bg-[#111926]'
                              )}
                              menuContentClassName="w-[var(--radix-dropdown-menu-trigger-width)] rounded-[10px] border border-[#E8EEF5] bg-white p-1 shadow-[0_12px_30px_rgba(0,0,0,0.08)] dark:border-[#2B3648] dark:bg-[#192233] dark:shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
                              onChange={(values) =>
                                updateModelDraft(model.key, (draft) => ({
                                  ...draft,
                                  outputModalities: values,
                                }))
                              }
                            />
                          </SettingsField>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <SettingsField
                            label={t(
                              'settings.cli.customProviders.form.contextLimitLabel'
                            )}
                          >
                            <input
                              type="number"
                              min="0"
                              className={settingsFieldClassName}
                              placeholder={String(DEFAULT_MODEL_CONTEXT_LIMIT)}
                              value={model.contextLimit}
                              onChange={(event) =>
                                updateModelDraft(model.key, (draft) => ({
                                  ...draft,
                                  contextLimit: event.target.value,
                                }))
                              }
                            />
                          </SettingsField>

                          <SettingsField
                            label={t(
                              'settings.cli.customProviders.form.outputLimitLabel'
                            )}
                          >
                            <input
                              type="number"
                              min="0"
                              className={settingsFieldClassName}
                              placeholder={String(DEFAULT_MODEL_OUTPUT_LIMIT)}
                              value={model.outputLimit}
                              onChange={(event) =>
                                updateModelDraft(model.key, (draft) => ({
                                  ...draft,
                                  outputLimit: event.target.value,
                                }))
                              }
                            />
                          </SettingsField>
                        </div>

                        <div className="rounded-[10px] border border-[#E8EEF5] bg-white/80 p-4 dark:border-[#2B3648] dark:bg-[rgba(17,25,38,0.82)]">
                          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
                            <div className="min-w-0">
                              <SettingsCheckbox
                                id={`custom-provider-thinking-${model.key}`}
                                label={t(
                                  'settings.cli.customProviders.form.thinkingLabel'
                                )}
                                description={t(
                                  'settings.cli.customProviders.form.thinkingHelper'
                                )}
                                checked={model.thinkingEnabled}
                                onChange={(checked) =>
                                  updateModelDraft(model.key, (draft) => ({
                                    ...draft,
                                    thinkingEnabled: checked,
                                    thinkingBudget: checked
                                      ? draft.thinkingBudget || '9216'
                                      : '',
                                  }))
                                }
                              />
                            </div>

                            <SettingsField
                              label={t(
                                'settings.cli.customProviders.form.thinkingBudgetLabel'
                              )}
                            >
                              <input
                                type="number"
                                min="0"
                                disabled={!model.thinkingEnabled}
                                className={settingsFieldClassName}
                                placeholder={t(
                                  'settings.cli.customProviders.form.thinkingBudgetPlaceholder'
                                )}
                                value={model.thinkingBudget}
                                onChange={(event) =>
                                  updateModelDraft(model.key, (draft) => ({
                                    ...draft,
                                    thinkingBudget: event.target.value,
                                  }))
                                }
                              />
                            </SettingsField>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-[#E8EEF5] bg-white px-6 py-4 dark:border-[#2B3648] dark:bg-[#111926] sm:flex-row sm:justify-end">
            <button
              type="button"
              className={settingsSecondaryButtonClassName}
              onClick={() => onOpenChange(false)}
            >
              {t('settings.cli.customProviders.form.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={settingsPrimaryButtonClassName}
            >
              {dialogCopy.submitLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
