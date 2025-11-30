import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import hi from "./locales/hi.json";
import kn from "./locales/kn.json";
import ta from "./locales/ta.json";
import te from "./locales/te.json";

// Safe language detection
const deviceLanguage =
  Localization?.locale?.split("-")[0] || "en"; // fallback to 'en' if undefined

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: "v3",
    lng: deviceLanguage,
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      kn: { translation: kn },
      hi: { translation: hi },
      ta: { translation: ta },
      te: {translation: te },
    },
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
