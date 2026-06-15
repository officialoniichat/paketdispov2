import type { Preview } from '@storybook/react-vite';
import type { JSX } from 'react';
import { LtThemeProvider } from '../src/theme/LtThemeProvider.js';

/** Wrap every story in the L&T theme so components render as in the apps. */
const preview: Preview = {
  parameters: { layout: 'padded' },
  decorators: [
    (Story): JSX.Element => (
      <LtThemeProvider>
        <Story />
      </LtThemeProvider>
    ),
  ],
};

export default preview;
