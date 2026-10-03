// Minimal i18n: English, Simplified Chinese, Japanese. No dependencies —
// a small string table plus a useSyncExternalStore hook so every
// component re-renders on language change. Journal *content* (entries,
// prompts, reminders) is user data and is never translated; only UI
// chrome goes through here.

import { useSyncExternalStore } from 'react';

export type Locale = 'en' | 'zh' | 'ja';
export type LangPref = 'auto' | Locale;

const LANG_KEY = 'starlog:lang';

export function getLangPref(): LangPref {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    return v === 'en' || v === 'zh' || v === 'ja' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setLangPref(p: LangPref): void {
  try {
    window.localStorage.setItem(LANG_KEY, p);
  } catch {
    /* private mode */
  }
  applyLangAttr(resolveLocale());
  notify();
}

/** Resolve the active locale: explicit pref, else the system language. */
export function resolveLocale(): Locale {
  const pref = getLangPref();
  if (pref !== 'auto') return pref;
  try {
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('zh')) return 'zh';
    if (nav.startsWith('ja')) return 'ja';
  } catch {
    /* ignore */
  }
  return 'en';
}

/** BCP 47 tag for Intl formatters. */
export function intlLocale(): string {
  const l = resolveLocale();
  return l === 'zh' ? 'zh-CN' : l === 'ja' ? 'ja-JP' : 'en-US';
}

/** Native name of the locale the system language resolves to — shown
 *  next to the "Auto" option so the user knows what Auto means. */
export function systemLangName(): string {
  try {
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('zh')) return '中文';
    if (nav.startsWith('ja')) return '日本語';
  } catch {
    /* ignore */
  }
  return 'English';
}

function applyLangAttr(l: Locale): void {
  try {
    document.documentElement.lang = l === 'zh' ? 'zh-CN' : l === 'ja' ? 'ja' : 'en';
  } catch {
    /* ignore */
  }
}

// Set once at startup so screen readers pronounce correctly.
applyLangAttr(resolveLocale());

export interface Strings {
  setup: {
    tagline: string;
    linkHint: string;
    manualHint: string;
    urlLabel: string;
    urlPlaceholder: string;
    keyLabel: string;
    connect: string;
    connecting: string;
    badUrl: string;
    shortKey: string;
    unreachable: string;
    unreachableWith: string;
    hint1: string;
    hintApi: string;
    hint2: string;
    noProject: string;
    agentSub: string;
    copyPrompt: string;
    copied: string;
    pasted: string;
  };
  install: {
    title: string;
    sub: string;
    step1: string;
    step2: string;
    step3: string;
    copy: string;
    pasted: string;
    browser: string;
  };
  settings: {
    title: string;
    weekStart: string;
    monday: string;
    sunday: string;
    theme: string;
    light: string;
    dark: string;
    auto: string;
    custom: string;
    language: string;
    copyThemePrompt: string;
    pasteTheme: string;
    copyFail: string;
    pasteFail: string;
    themeHint: string;
    copyThemeTitle: string;
    clear: string;
    disconnect: string;
    disconnectTitle: string;
    disconnectDesc: string;
    disconnectAction: string;
    about: string;
    build: string;
  };
  app: {
    prevWeekday: string;
    nextWeekday: string;
    weekdayBack: string;
    openCalendar: string;
    backToJournal: string;
    settings: string;
    unreachable: string;
    updateAvailable: string;
    updateDetail: string;
    copyPrompt: string;
    promptCopied: string;
    newVersion: string;
    newVersionDetail: string;
    refresh: string;
  };
  ui: { loading: string; errorDefault: string };
  calendar: {
    loadError: string;
    loadFail: string;
    hasEntry: string;
    reminderUnit: string;
  };
  sheet: {
    today: string;
    thisWeek: string;
    nextWeek: string;
    lastWeek: string;
    weeksOut: string;
    weeksAgo: string;
    loadError: string;
    empty1: string;
    empty2: string;
    prompt: string;
    important: string;
    reminder: string;
    spanDays: string;
    spanDayOf: string;
  };
  sound: { play: string; pause: string; untitled: string };
}

const en: Strings = {
  setup: {
    tagline: 'A journal for focus and reflection.',
    linkHint: 'Your project link filled in the URL — just add the anon key.',
    manualHint:
      'Point it at your own Supabase project to begin. Have a setup link? Paste the whole link into the URL field.',
    urlLabel: 'Supabase project URL',
    urlPlaceholder: 'https://xyz.supabase.co — or paste a setup link',
    keyLabel: 'Anon key',
    connect: 'Connect',
    connecting: 'Connecting…',
    badUrl: 'That doesn’t look like a Supabase project URL.',
    shortKey: 'That key looks too short — paste the full anon key.',
    unreachable: 'Couldn’t reach that project.',
    unreachableWith: 'Couldn’t reach that project: {msg}',
    hint1: 'Find both in your Supabase dashboard under',
    hintApi: 'Project Settings → API',
    hint2:
      '. They stay on this device only. The app can only read — it never writes to your journal.',
    noProject: 'No project yet?',
    agentSub:
      'Copy this prompt, send it to your AI agent, and paste back the setup link it gives you.',
    copyPrompt: 'Copy agent prompt',
    copied: 'Copied',
    pasted: 'Paste it to your agent — it’ll hand you a setup link.',
  },
  install: {
    title: 'Install Starlog first',
    sub: 'This setup link opened in the browser, but Starlog lives on your home screen — and the installed app keeps its own storage. Install it, then paste your link there.',
    step1: 'Copy your setup link below.',
    step2: 'Tap Share, then Add to Home Screen.',
    step3: 'Open Starlog from your home screen and paste the link into the Project URL field.',
    copy: 'Copy setup link',
    pasted: 'Now install the app and paste it there.',
    browser: 'Use in browser instead',
  },
  settings: {
    title: 'Settings',
    weekStart: 'Week starts on',
    monday: 'Monday',
    sunday: 'Sunday',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    auto: 'Auto',
    custom: 'Custom',
    language: 'Language',
    copyThemePrompt: 'Copy agent prompt',
    pasteTheme: 'Paste theme config',
    copyFail: 'Could not copy the prompt.',
    pasteFail: 'Could not read the clipboard. Paste access was denied.',
    themeHint:
      'Copy the prompt, ask your agent to make a theme, then paste the JSON back here.',
    copyThemeTitle: 'Tap to copy the full theme JSON',
    clear: 'Clear',
    disconnect: 'Disconnect project…',
    disconnectTitle: 'Disconnect project?',
    disconnectDesc:
      'This removes the Supabase connection from this device. Your journal data stays in Supabase.',
    disconnectAction: 'Disconnect',
    about: 'About',
    build: 'Build',
  },
  app: {
    prevWeekday: 'Previous weekday',
    nextWeekday: 'Next weekday',
    weekdayBack: '{day} — back to today',
    openCalendar: 'Open calendar',
    backToJournal: 'Back to journal',
    settings: 'Settings',
    unreachable: 'Couldn’t reach your journal.',
    updateAvailable: 'Database update available',
    updateDetail: 'Your journal’s database is at {have} but this app needs {need}.',
    copyPrompt: 'Copy prompt for your agent',
    promptCopied: 'Copied — paste it to your agent.',
    newVersion: 'New version available',
    newVersionDetail: 'Refresh to get the latest Starlog.',
    refresh: 'Refresh',
  },
  ui: {
    loading: 'Reading the log…',
    errorDefault: 'Something didn’t come through. Try again in a moment.',
  },
  calendar: {
    loadError: 'The calendar didn’t load.',
    loadFail: 'Couldn’t load the calendar.',
    hasEntry: 'has entry',
    reminderUnit: 'reminders',
  },
  sheet: {
    today: 'TODAY',
    thisWeek: 'this week',
    nextWeek: 'next week',
    lastWeek: 'last week',
    weeksOut: '{n} weeks out',
    weeksAgo: '{n} weeks ago',
    loadError: "Couldn't load entries.",
    empty1: 'Nothing here yet.',
    empty2: 'Ask your agent to add an entry for today.',
    prompt: 'PROMPT ·',
    important: 'IMPORTANT ·',
    reminder: 'REMINDER ·',
    spanDays: '{n} days',
    spanDayOf: 'day {d} of {n}',
  },
  sound: { play: 'Play sound', pause: 'Pause sound', untitled: 'sound' },
};

const zh: Strings = {
  setup: {
    tagline: '专注与反思的日记。',
    linkHint: '项目链接已填入网址，只需加上 anon key。',
    manualHint:
      '将它指向你自己的 Supabase 项目即可开始。有设置链接？把整个链接粘贴到网址栏。',
    urlLabel: 'Supabase 项目 URL',
    urlPlaceholder: 'https://xyz.supabase.co — 或粘贴设置链接',
    keyLabel: 'Anon key',
    connect: '连接',
    connecting: '连接中…',
    badUrl: '这看起来不像 Supabase 项目 URL。',
    shortKey: '密钥似乎太短了 — 请粘贴完整的 anon key。',
    unreachable: '无法连接到该项目。',
    unreachableWith: '无法连接到该项目：{msg}',
    hint1: '在 Supabase 控制台的',
    hintApi: 'Project Settings → API',
    hint2: ' 下可以找到这两项。它们只保存在这台设备上。本应用只能读取 — 永远不会写入你的日记。',
    noProject: '还没有项目？',
    agentSub: '复制这段提示词发给你的 AI 助手，把它给你的设置链接粘贴回来。',
    copyPrompt: '复制助手提示词',
    copied: '已复制',
    pasted: '发给你的助手吧 — 它会给你一个设置链接。',
  },
  install: {
    title: '先安装 Starlog',
    sub: '这个设置链接在浏览器中打开了，但 Starlog 住在你的主屏幕上 — 安装后的应用有自己独立的存储空间。请先安装，再把链接粘贴过去。',
    step1: '在下方复制你的设置链接。',
    step2: '轻点「分享」，然后选择「添加到主屏幕」。',
    step3: '从主屏幕打开 Starlog，把链接粘贴到项目 URL 栏。',
    copy: '复制设置链接',
    pasted: '现在去安装应用，把链接粘贴过去吧。',
    browser: '改用浏览器打开',
  },
  settings: {
    title: '设置',
    weekStart: '一周起始日',
    monday: '周一',
    sunday: '周日',
    theme: '主题',
    light: '浅色',
    dark: '深色',
    auto: '自动',
    custom: '自定义',
    language: '语言',
    copyThemePrompt: '复制助手提示词',
    pasteTheme: '粘贴主题配置',
    copyFail: '无法复制提示词。',
    pasteFail: '无法读取剪贴板。粘贴权限被拒绝。',
    themeHint: '复制提示词，让你的助手来设计主题，再把 JSON 粘贴回来。',
    copyThemeTitle: '轻点复制完整主题 JSON',
    clear: '清除',
    disconnect: '断开项目…',
    disconnectTitle: '断开项目？',
    disconnectDesc: '这将从此设备移除 Supabase 连接。你的日记数据仍保留在 Supabase 中。',
    disconnectAction: '断开连接',
    about: '关于',
    build: '版本',
  },
  app: {
    prevWeekday: '上一个',
    nextWeekday: '下一个',
    weekdayBack: '{day} — 回到今天',
    openCalendar: '打开日历',
    backToJournal: '返回日记',
    settings: '设置',
    unreachable: '无法连接到你的日记。',
    updateAvailable: '有数据库更新',
    updateDetail: '你的日记数据库是 {have}，但此应用需要 {need}。',
    copyPrompt: '复制给助手的提示',
    promptCopied: '已复制 — 粘贴给你的助手。',
    newVersion: '有新版本',
    newVersionDetail: '刷新以获取最新版 Starlog。',
    refresh: '刷新',
  },
  ui: {
    loading: '正在读取日志…',
    errorDefault: '好像没加载出来。稍后再试一次吧。',
  },
  calendar: {
    loadError: '日历没能加载。',
    loadFail: '无法加载日历。',
    hasEntry: '有日记',
    reminderUnit: '条提醒',
  },
  sheet: {
    today: '今天',
    thisWeek: '本周',
    nextWeek: '下周',
    lastWeek: '上周',
    weeksOut: '{n} 周后',
    weeksAgo: '{n} 周前',
    loadError: '日记没能加载。',
    empty1: '这里还没有内容。',
    empty2: '请让你的助手为今天添加一篇日记。',
    prompt: '提问 ·',
    important: '重要 ·',
    reminder: '提醒 ·',
    spanDays: '{n} 天',
    spanDayOf: '第 {d} 天 / 共 {n} 天',
  },
  sound: { play: '播放声音', pause: '暂停声音', untitled: '声音' },
};

const ja: Strings = {
  setup: {
    tagline: '集中と振り返りのためのジャーナル。',
    linkHint: 'プロジェクトリンクが URL に入力されました — anon key を追加してください。',
    manualHint:
      '自分の Supabase プロジェクトを指定して始めましょう。セットアップリンクをお持ちですか？リンク全体を URL 欄に貼り付けてください。',
    urlLabel: 'Supabase プロジェクト URL',
    urlPlaceholder: 'https://xyz.supabase.co — またはセットアップリンクを貼り付け',
    keyLabel: 'Anon key',
    connect: '接続',
    connecting: '接続中…',
    badUrl: 'Supabase プロジェクトの URL ではないようです。',
    shortKey: 'キーが短すぎます — anon key 全体を貼り付けてください。',
    unreachable: 'そのプロジェクトに接続できませんでした。',
    unreachableWith: 'そのプロジェクトに接続できませんでした：{msg}',
    hint1: '両方とも Supabase ダッシュボードの',
    hintApi: 'Project Settings → API',
    hint2: ' にあります。このデバイスにのみ保存されます。このアプリは読み取り専用 — ジャーナルに書き込むことはありません。',
    noProject: 'まだプロジェクトがありませんか？',
    agentSub:
      'このプロンプトをコピーして AI アシスタントに送り、返ってきたセットアップリンクを貼り付けてください。',
    copyPrompt: 'エージェント用プロンプトをコピー',
    copied: 'コピーしました',
    pasted: 'アシスタントに貼り付けてください — セットアップリンクを渡してくれます。',
  },
  install: {
    title: 'まず Starlog をインストール',
    sub: 'このセットアップリンクはブラウザで開きましたが、Starlog はホーム画面にあります — インストールしたアプリは独自のストレージを持っています。インストールしてから、リンクをそちらに貼り付けてください。',
    step1: '下のセットアップリンクをコピーしてください。',
    step2: '「共有」をタップし、「ホーム画面に追加」を選んでください。',
    step3: 'ホーム画面から Starlog を開き、リンクをプロジェクト URL 欄に貼り付けてください。',
    copy: 'セットアップリンクをコピー',
    pasted: 'アプリをインストールして、そちらに貼り付けてください。',
    browser: '代わりにブラウザで使う',
  },
  settings: {
    title: '設定',
    weekStart: '週の開始曜日',
    monday: '月曜日',
    sunday: '日曜日',
    theme: 'テーマ',
    light: 'ライト',
    dark: 'ダーク',
    auto: '自動',
    custom: 'カスタム',
    language: '言語',
    copyThemePrompt: 'エージェント用プロンプトをコピー',
    pasteTheme: 'テーマ設定を貼り付け',
    copyFail: 'プロンプトをコピーできませんでした。',
    pasteFail: 'クリップボードを読み取れませんでした。貼り付けが拒否されました。',
    themeHint: 'プロンプトをコピーしてエージェントにテーマを作ってもらい、JSON をここに貼り付けてください。',
    copyThemeTitle: 'タップしてテーマ JSON 全体をコピー',
    clear: 'クリア',
    disconnect: 'プロジェクトの接続を解除…',
    disconnectTitle: 'プロジェクトの接続を解除しますか？',
    disconnectDesc: 'このデバイスから Supabase 接続を削除します。ジャーナルのデータは Supabase に残ります。',
    disconnectAction: '接続を解除',
    about: 'このアプリについて',
    build: 'ビルド',
  },
  app: {
    prevWeekday: '前の曜日',
    nextWeekday: '次の曜日',
    weekdayBack: '{day} — 今日に戻る',
    openCalendar: 'カレンダーを開く',
    backToJournal: 'ジャーナルに戻る',
    settings: '設定',
    unreachable: 'ジャーナルに接続できませんでした。',
    updateAvailable: 'データベースの更新があります',
    updateDetail: 'ジャーナルのデータベースは {have} ですが、このアプリには {need} が必要です。',
    copyPrompt: 'エージェント用のプロンプトをコピー',
    promptCopied: 'コピーしました — エージェントに貼り付けてください。',
    newVersion: '新しいバージョンがあります',
    newVersionDetail: '最新の Starlog を取得するには更新してください。',
    refresh: '更新',
  },
  ui: {
    loading: 'ログを読み込み中…',
    errorDefault: '読み込めませんでした。しばらくしてからもう一度お試しください。',
  },
  calendar: {
    loadError: 'カレンダーを読み込めませんでした。',
    loadFail: 'カレンダーの読み込みに失敗しました。',
    hasEntry: '記録あり',
    reminderUnit: '件のリマインダー',
  },
  sheet: {
    today: '今日',
    thisWeek: '今週',
    nextWeek: '来週',
    lastWeek: '先週',
    weeksOut: '{n} 週間後',
    weeksAgo: '{n} 週間前',
    loadError: '記録を読み込めませんでした。',
    empty1: 'まだ何もありません。',
    empty2: 'エージェントに今日の記録の追加を頼んでください。',
    prompt: 'プロンプト ·',
    important: '重要 ·',
    reminder: 'リマインダー ·',
    spanDays: '{n}日間',
    spanDayOf: '{n}日中{d}日目',
  },
  sound: { play: 'サウンドを再生', pause: 'サウンドを一時停止', untitled: 'サウンド' },
};

export const STRINGS: Record<Locale, Strings> = { en, zh, ja };

/** Fill {placeholders} in a template string. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(`{${k}}`, String(v));
  }
  return out;
}

export function getStrings(): Strings {
  return STRINGS[resolveLocale()];
}

/** React hook: the string table for the active locale, live-updating. */
export function useStrings(): Strings {
  return useSyncExternalStore(subscribe, getStrings, getStrings);
}
