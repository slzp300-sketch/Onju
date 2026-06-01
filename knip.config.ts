import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  project: ['src/**/*.{ts,tsx}'],
  ignore: ['src/mocks/**'],
  ignoreDependencies: ['autoprefixer'],
};

export default config;
