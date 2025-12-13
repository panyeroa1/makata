export enum AppMode {
  IDLE = 'IDLE',
  SETUP = 'SETUP',
  WAITING_ROOM = 'WAITING_ROOM',   // User is waiting for host
  CALL_DISCRETE = 'CALL_DISCRETE', // STT -> Translate -> TTS Pipeline
  CALL_LIVE = 'CALL_LIVE',         // Gemini Live API
}

export enum RoomMode {
  ONE_ON_ONE = 'one_on_one',
  ONE_TO_MANY = 'one_to_many',
}

export interface ConsentState {
  granted: boolean;
  timestamp: number | null;
  region: string;
}

export enum Language {
  AUTO = 'Auto-Detect',
  AFRIKAANS = 'Afrikaans',
  ALBANIAN = 'Albanian',
  AMHARIC = 'Amharic',
  ARABIC = 'Arabic (General)',
  ARABIC_ALGERIA = 'Arabic (Algeria)',
  ARABIC_BAHRAIN = 'Arabic (Bahrain)',
  ARABIC_EGYPT = 'Arabic (Egypt)',
  ARABIC_IRAQ = 'Arabic (Iraq)',
  ARABIC_ISRAEL = 'Arabic (Israel)',
  ARABIC_JORDAN = 'Arabic (Jordan)',
  ARABIC_KUWAIT = 'Arabic (Kuwait)',
  ARABIC_LEBANON = 'Arabic (Lebanon)',
  ARABIC_MOROCCO = 'Arabic (Morocco)',
  ARABIC_OMAN = 'Arabic (Oman)',
  ARABIC_PALESTINE = 'Arabic (Palestinian Territories)',
  ARABIC_QATAR = 'Arabic (Qatar)',
  ARABIC_SAUDI = 'Arabic (Saudi Arabia)',
  ARABIC_TUNISIA = 'Arabic (Tunisia)',
  ARABIC_UAE = 'Arabic (UAE)',
  ARABIC_YEMEN = 'Arabic (Yemen)',
  ARMENIAN = 'Armenian',
  ASSAMESE = 'Assamese',
  AZERBAIJANI = 'Azerbaijani',
  BASQUE = 'Basque',
  BELARUSIAN = 'Belarusian',
  BENGALI = 'Bengali (General)',
  BENGALI_BANGLADESH = 'Bengali (Bangladesh)',
  BENGALI_INDIA = 'Bengali (India)',
  BOSNIAN = 'Bosnian',
  BULGARIAN = 'Bulgarian',
  BURMESE = 'Burmese',
  CATALAN = 'Catalan',
  CHINESE_MANDARIN_SIMPLIFIED = 'Chinese (Mandarin Simplified)',
  CHINESE_MANDARIN_TRADITIONAL = 'Chinese (Mandarin Traditional)',
  CHINESE_CANTONESE = 'Chinese (Cantonese)',
  CROATIAN = 'Croatian',
  CZECH = 'Czech',
  DANISH = 'Danish',
  DUTCH = 'Dutch (Netherlands)',
  DUTCH_BELGIUM = 'Dutch (Belgium)',
  ENGLISH_AUSTRALIA = 'English (Australia)',
  ENGLISH_CANADA = 'English (Canada)',
  ENGLISH_GHANA = 'English (Ghana)',
  ENGLISH_HK = 'English (Hong Kong)',
  ENGLISH_INDIA = 'English (India)',
  ENGLISH_IRELAND = 'English (Ireland)',
  ENGLISH_KENYA = 'English (Kenya)',
  ENGLISH_NZ = 'English (New Zealand)',
  ENGLISH_NIGERIA = 'English (Nigeria)',
  ENGLISH_PHILIPPINES = 'English (Philippines)',
  ENGLISH_SINGAPORE = 'English (Singapore)',
  ENGLISH_SOUTH_AFRICA = 'English (South Africa)',
  ENGLISH_TANZANIA = 'English (Tanzania)',
  ENGLISH_UK = 'English (United Kingdom)',
  ENGLISH_US = 'English (United States)',
  ESTONIAN = 'Estonian',
  FILIPINO = 'Filipino',
  FINNISH = 'Finnish',
  FRENCH = 'French (France)',
  FRENCH_BELGIUM = 'French (Belgium)',
  FRENCH_CANADA = 'French (Canada)',
  FRENCH_SWITZERLAND = 'French (Switzerland)',
  GALICIAN = 'Galician',
  GEORGIAN = 'Georgian',
  GERMAN = 'German (Germany)',
  GERMAN_AUSTRIA = 'German (Austria)',
  GERMAN_SWITZERLAND = 'German (Switzerland)',
  GREEK = 'Greek',
  GUJARATI = 'Gujarati',
  HAUSA = 'Hausa',
  HEBREW = 'Hebrew',
  HINDI = 'Hindi',
  HUNGARIAN = 'Hungarian',
  ICELANDIC = 'Icelandic',
  IGBO = 'Igbo',
  INDONESIAN = 'Indonesian',
  IRISH = 'Irish',
  ITALIAN = 'Italian',
  ITALIAN_SWITZERLAND = 'Italian (Switzerland)',
  JAPANESE = 'Japanese',
  JAVANESE = 'Javanese',
  KANNADA = 'Kannada',
  KAZAKH = 'Kazakh',
  KHMER = 'Khmer',
  KOREAN = 'Korean',
  LAO = 'Lao',
  LATVIAN = 'Latvian',
  LITHUANIAN = 'Lithuanian',
  MACEDONIAN = 'Macedonian',
  MALAY = 'Malay',
  MALAYALAM = 'Malayalam',
  MARATHI = 'Marathi',
  MONGOLIAN = 'Mongolian',
  NEPALI = 'Nepali',
  NORWEGIAN = 'Norwegian',
  PERSIAN = 'Persian (Farsi)',
  POLISH = 'Polish',
  PORTUGUESE = 'Portuguese (Portugal)',
  PORTUGUESE_BRAZIL = 'Portuguese (Brazil)',
  PUNJABI = 'Punjabi',
  ROMANIAN = 'Romanian',
  RUSSIAN = 'Russian',
  SERBIAN = 'Serbian',
  SINHALA = 'Sinhala',
  SLOVAK = 'Slovak',
  SLOVENIAN = 'Slovenian',
  SOMALI = 'Somali',
  SPANISH_SPAIN = 'Spanish (Spain)',
  SPANISH_ARGENTINA = 'Spanish (Argentina)',
  SPANISH_BOLIVIA = 'Spanish (Bolivia)',
  SPANISH_CHILE = 'Spanish (Chile)',
  SPANISH_COLOMBIA = 'Spanish (Colombia)',
  SPANISH_COSTA_RICA = 'Spanish (Costa Rica)',
  SPANISH_DOMINICAN = 'Spanish (Dominican Republic)',
  SPANISH_ECUADOR = 'Spanish (Ecuador)',
  SPANISH_EL_SALVADOR = 'Spanish (El Salvador)',
  SPANISH_GUATEMALA = 'Spanish (Guatemala)',
  SPANISH_HONDURAS = 'Spanish (Honduras)',
  SPANISH_MEXICO = 'Spanish (Mexico)',
  SPANISH_NICARAGUA = 'Spanish (Nicaragua)',
  SPANISH_PANAMA = 'Spanish (Panama)',
  SPANISH_PARAGUAY = 'Spanish (Paraguay)',
  SPANISH_PERU = 'Spanish (Peru)',
  SPANISH_PUERTO_RICO = 'Spanish (Puerto Rico)',
  SPANISH_US = 'Spanish (United States)',
  SPANISH_URUGUAY = 'Spanish (Uruguay)',
  SPANISH_VENEZUELA = 'Spanish (Venezuela)',
  SWAHILI = 'Swahili',
  SWEDISH = 'Swedish',
  TAMIL = 'Tamil',
  TELUGU = 'Telugu',
  THAI = 'Thai',
  TURKISH = 'Turkish',
  UKRAINIAN = 'Ukrainian',
  URDU = 'Urdu',
  UZBEK = 'Uzbek',
  VIETNAMESE = 'Vietnamese',
  WELSH = 'Welsh',
  YORUBA = 'Yoruba',
  ZULU = 'Zulu'
}

export interface LanguageConfig {
  source: Language;
  target: Language;
}

export enum PipelineState {
  LISTENING = 'Listening',
  PROCESSING = 'Processing',
  SPEAKING = 'Speaking',
  IDLE = 'Idle'
}

export interface MessageLog {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text?: string;
  translation?: string;
  timestamp: number;
}

export interface Participant {
  id: string;
  name: string;
  role: 'host' | 'guest';
  status: 'active' | 'waiting';
  isMuted: boolean;
  isCamOn: boolean;
  avatarUrl?: string;
  isHandRaised?: boolean;
}

export interface SubtitleState {
  original: string;
  translation: string;
  lastUpdated: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export enum AppTheme {
  DARK = 'DARK',
  LIGHT = 'LIGHT',
  SYSTEM = 'SYSTEM',
}

export enum AppFont {
  FUTURISTIC = 'FUTURISTIC',
  CLASSIC = 'CLASSIC',
  TERMINAL = 'TERMINAL',
}

export interface AppSettings {
  theme: AppTheme;
  font: AppFont;
  allowInstantJoin: boolean; // Replaces waiting room toggle if true
}