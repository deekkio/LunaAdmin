import { enUS } from '@luna/components/locale/en-US';
import type chinese from './zh-cn';

export default {
  ...enUS,
  app: {
    brand: 'Luna Admin',
    administrator: 'Administrator',
    navigation: 'Main navigation',
    breadcrumb: 'Page path',
    collapse: 'Collapse sidebar',
    expand: 'Expand sidebar',
    enterFull: 'Enter fullscreen',
    exitFull: 'Exit fullscreen',
    fullError: 'Unable to change fullscreen mode. Please try again.',
    fullUnavailable: 'Fullscreen is unavailable in this browser',
    theme: 'Theme mode',
    light: 'Light mode',
    dark: 'Dark mode',
    system: 'System preference',
    language: 'Change language',
    logout: 'Log out',
  } satisfies typeof chinese.app,
};
