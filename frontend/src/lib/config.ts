export const featureFlags = {
  enableBlockEditor: import.meta.env.VITE_FEATURE_BLOCK_EDITOR !== 'false',
  enableBlockRenderer: import.meta.env.VITE_FEATURE_BLOCK_RENDERER === 'true',
  enableBlockAI: import.meta.env.VITE_FEATURE_BLOCK_AI !== 'false'
} as const;

export type FeatureFlags = typeof featureFlags;

export const getFeatureFlag = <K extends keyof FeatureFlags>(key: K): FeatureFlags[K] => featureFlags[key];
