import type { StorybookConfig } from '@storybook/react-vite';

/** Storybook config for the @paket/ui design system (DoD: renders core components). */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
};

export default config;
