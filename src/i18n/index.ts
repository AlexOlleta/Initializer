import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Language } from "@/lib/bindings/Language";
import en from "./en.json";
import es from "./es.json";

export function resolveLanguage(language: Language): "es" | "en" {
  if (language !== "system") return language;
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: resolveLanguage("system"),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
