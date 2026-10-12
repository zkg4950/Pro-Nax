/* Copyright (c) 2026 ProNax. All rights reserved. */

import { getGeoDataWithCache } from './geolocationHelper';
import { LANGUAGES } from './languages';

// Language patterns for detection (character sets and common words)
const LANGUAGE_PATTERNS: Record<string, {
  script: RegExp;
  commonWords?: string[];
}> = {
  // Arabic script
  ar: { script: /[\u0600-\u06FF]/ },
  ur: { script: /[\u0600-\u06FF]/, commonWords: ['میں', 'ہے', 'کے', 'سے', 'کی', 'کا', 'گئی', 'ہوں', 'تھا', 'تھی'] },
  fa: { script: /[\u0600-\u06FF]/, commonWords: ['من', 'است', 'که', 'را', 'با', 'در', 'این', 'و', 'از', 'به'] },
  skr: { script: /[\u0600-\u06FF]/, commonWords: ['میݙا', 'تہاݙا', 'سئیں', 'کوں', 'دا', 'دی', 'وچ', 'تے', 'ایں', 'ہو'] },
  
  // Indic scripts
  hi: { script: /[\u0900-\u097F]/, commonWords: ['में', 'है', 'के', 'से', 'की', 'का', 'गई', 'हूं', 'था', 'थी'] },
  pa: { script: /[\u0A00-\u0A7F]/, commonWords: ['ਵਿੱਚ', 'ਹੈ', 'ਦੇ', 'ਤੋਂ', 'ਦੀ', 'ਦਾ', 'ਗਈ', 'ਹਾਂ', 'ਸੀ'] },
  bn: { script: /[\u0980-\u09FF]/, commonWords: ['মধ্যে', 'আছে', 'এর', 'থেকে', 'এর', 'একটি', 'গেছে', 'আমি', 'ছিল'] },
  ta: { script: /[\u0B80-\u0BFF]/, commonWords: ['இல்', 'உள்ள', 'இன்', 'இருந்து', 'ஒரு', 'போன', 'நான்', 'இருந்தது'] },
  te: { script: /[\u0C00-\u0C7F]/, commonWords: ['లో', 'ఉన్నారు', 'కి', 'నుండి', 'ఒక', 'వెళ్ళారు', 'నేను', 'ఉంది'] },
  
  // CJK
  zh: { script: /[\u4E00-\u9FFF]/ },
  ja: { script: /[\u3040-\u309F\u4E00-\u9FFF]/ },
  ko: { script: /[\uAC00-\uD7AF\u1100-\u11FF]/ },
  
  // Cyrillic
  ru: { script: /[\u0400-\u04FF]/, commonWords: ['в', 'на', 'и', 'я', 'с', 'что', 'это', 'к', 'а', 'то'] },
  uk: { script: /[\u0400-\u04FF]/, commonWords: ['в', 'на', 'і', 'я', 'з', 'що', 'це', 'к', 'а', 'то'] },
  sr: { script: /[\u0400-\u04FF]/, commonWords: ['у', 'на', 'и', 'ја', 'са', 'шта', 'ово', 'к', 'а', 'то'] },
  bg: { script: /[\u0400-\u04FF]/, commonWords: ['в', 'на', 'и', 'я', 'с', 'какво', 'това', 'к', 'а', 'то'] },
  
  // Greek
  el: { script: /[\u0370-\u03FF]/ },
  
  // Hebrew
  he: { script: /[\u0590-\u05FF]/ },
  
  // Thai
  th: { script: /[\u0E00-\u0E7F]/ },
  
  // Other scripts
  ka: { script: /[\u10A0-\u10FF]/ }, // Georgian
  hy: { script: /[\u0530-\u058F]/ }, // Armenian
  am: { script: /[\u1200-\u137F]/ }, // Amharic
  my: { script: /[\u1000-\u109F]/ }, // Burmese
  km: { script: /[\u1780-\u17FF]/ }, // Khmer
  lo: { script: /[\u0E80-\u0EFF]/ }, // Lao
  ne: { script: /[\u0900-\u097F]/ }, // Nepali (Devanagari)
  si: { script: /[\u0D80-\u0DFF]/ }, // Sinhala
};

// Country to default language mapping
const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  PK: 'skr', // Pakistan - Saraiki priority
  SA: 'ar', AE: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar', LB: 'ar',
  EG: 'ar', IQ: 'ar', SY: 'ar', YE: 'ar', LY: 'ar', TN: 'ar', DZ: 'ar', MA: 'ar', SD: 'ar',
  IR: 'fa', AF: 'ps', TR: 'tr', IN: 'hi', BD: 'bn', CN: 'zh', JP: 'ja', KR: 'ko',
  RU: 'ru', UA: 'uk', TH: 'th', VN: 'vi', ID: 'id', MY: 'ms', PH: 'fil',
  US: 'en', GB: 'en', CA: 'en', AU: 'en', NZ: 'en', IE: 'en',
};

/**
 * Detect language from text using script and common word patterns
 */
export function detectLanguageFromText(text: string): string {
  if (!text || text.length < 2) return 'en';
  
  let bestMatch = 'en';
  let maxScore = 0;
  
  for (const [langCode, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
    let score = 0;
    
    const scriptMatches = pattern.script.test(text);
    if (scriptMatches) score += 10;
    
    if (pattern.commonWords) {
      for (const word of pattern.commonWords) {
        if (text.includes(word)) score += 5;
      }
    }
    
    if (score > maxScore) {
      maxScore = score;
      bestMatch = langCode;
    }
  }
  
  return bestMatch;
}

/**
 * Get default language based on country code
 */
export function getDefaultLanguageForCountry(countryCode: string): string {
  return COUNTRY_LANGUAGE_MAP[countryCode.toUpperCase()] || 'en';
}

/**
 * Auto-detect user language from geo-location
 */
export async function detectLanguageFromGeo(): Promise<string> {
  try {
    const geoData = await getGeoDataWithCache();
    if (geoData && geoData.countryCode) {
      return getDefaultLanguageForCountry(geoData.countryCode);
    }
  } catch (error) {
    console.warn('[aiLanguageDetector] Failed to detect language from geo:', error);
  }
  return 'en';
}

/**
 * Get language-specific greeting
 */
export function getGreetingForLanguage(langCode: string, creatorName: string = 'Creator'): string {
  const greetings: Record<string, string> = {
    skr: `السلام علیکم سئیں ${creatorName}! پرو-نیکس سٹوڈیو وچ خوش آمدید۔ میݙا چینل کیویں چلدا پئے سئیں؟`,
    ur: `السلام علیکم ${creatorName}! پرو-نیکس سٹوڈیو میں خوش آمدید۔ آپ کا چینل کیسے چل رہا ہے؟`,
    ar: `مرحبا ${creatorName}! مرحبا بك في استوديو برو-نيكس. كيف يعمل قناتك؟`,
    en: `Hey ${creatorName}! Good to see you back in the studio. How's your channel doing?`,
    hi: `नमस्ते ${creatorName}! स्टूडियो में वापसी पर आपका स्वागत है। आपका चैनल कैसा चल रहा है?`,
    pa: `ਸਤ ਸ੍ਰੀ ਅਕਾਲ ${creatorName}! ਸਟੂਡੀਓ ਵਿੱਚ ਵਾਪਸੀ ਤੇ ਤੁਹਾਡਾ ਸਵਾਗਤ ਹੈ। ਤੁਹਾਡਾ ਚੈਨਲ ਕਿਵੇਂ ਚੱਲ ਰਿਹਾ ਹੈ?`,
    fa: `سلام ${creatorName}! خوش آمدید به استودیو پرو-نیکس. کانال شما چطور کار می‌کند؟`,
    tr: `Merhaba ${creatorName}! ProNax stüdyosuna tekrar hoş geldiniz. Kanalınız nasıl gidiyor?`,
    zh: `你好 ${creatorName}！欢迎回到 ProNax 工作室。您的频道怎么样？`,
    ja: `${creatorName}さん、こんにちは！ProNaxスタジオへようこそ。チャンネルは順調ですか？`,
    ko: `${creatorName}님, 안녕하세요! ProNax 스튜디오에 다시 오신 것을 환영합니다. 채널은 어떻게 되고 있나요?`,
    ru: `Привет ${creatorName}! Рад снова видеть тебя в студии ProNax. Как дела у канала?`,
    es: `¡Hola ${creatorName}! Bienvenido de nuevo al estudio ProNax. ¿Cómo va tu canal?`,
    fr: `Bonjour ${creatorName}! Bon retour au studio ProNax. Comment va votre chaîne?`,
    de: `Hallo ${creatorName}! Willkommen zurück im ProNax-Studio. Wie läuft dein Kanal?`,
    pt: `Olá ${creatorName}! Bem-vindo de volta ao estúdio ProNax. Como está seu canal?`,
    it: `Ciao ${creatorName}! Bentornato nello studio ProNax. Come sta il tuo canale?`,
  };
  return greetings[langCode] || greetings['en'];
}

/**
 * Get language-specific system prompt for AI
 */
export function getSystemPromptForLanguage(langCode: string): string {
  const prompts: Record<string, string> = {
    skr: 'تو ہک ساتھارا اور مددگار ای۔آی۔ معاونت ہے۔ تہاکوں صرف سرائیکی وچ جواب دینا چاہیدا اے۔ تہاݙے جواب وچ مددگار تے دوستانہ لہجہ ہوو۔',
    ur: 'آپ ایک مددگار اور دوستانہ AI اسسٹنٹ ہیں۔ آپ کو اردو میں جواب دینا چاہیے۔ آپ کے جواب میں مددگار اور دوستانہ لہجہ ہو۔',
    ar: 'أنت مساعد AI ودود ومفيد. يجب أن تجيب باللغة العربية. يجب أن يكون نبرة صوتك مفيدة وودية.',
    en: 'You are a helpful and friendly AI assistant. Respond in the same language as the user. Be conversational and helpful.',
    hi: 'आप एक मददगार और मित्रवत AI सहायक हैं। उपयोगकर्ता की भाषा में उत्तर दें। बातचीत करने वाले और मददगार बनें।',
    pa: 'ਤੁਸੀਂ ਇੱਕ ਮਦਦਗਾਰ ਅਤੇ ਦੋਸਤਾਨਾ  AI ਸਹਾਇਕ ਹੋ। ਉਪਭੋਗਤਾ ਦੀ ਭਾਸ਼ਾ ਵਿੱਚ ਜਵਾਬ ਦਿਓ। ਗੱਲਬਾਤ ਕਰਨ ਵਾਲੇ ਅਤੇ ਮਦਦਗਾਰ ਬਣੋ।',
  };
  return prompts[langCode] || prompts['en'];
}
