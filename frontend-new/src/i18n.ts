import { Locale } from '@/types';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';
import ja from '@/locales/ja.json';
import ko from '@/locales/ko.json';
import zh from '@/locales/zh.json';

export const i18nDict: Record<Locale, Record<string, string>> = {
  en,
  zh,
  ja,
  ko,
  fr,
  es,
};
