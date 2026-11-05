import type { ItemId } from '../economy';

/** 一种语言的全部文案。用函数写带数字的句子，英文的单复数也能在这里处理。 */
export type Messages = {
  htmlLang: string;
  title: string;
  description: string;
  languageLabel: string;
  boardLabel: string;
  listSeparator: string;

  back: string;
  restart: string;
  skip: string;
  next: string;
  close: string;
  prevChapter: string;
  nextChapter: string;
  muteOn: string;
  muteOff: string;
  openShop: (coins: number) => string;
  shop: string;
  coinsShort: (coins: number) => string;

  copyShare: string;
  copied: string;
  copySuccess: string;
  copyFail: string;

  dailyTitle: string;
  dailyHud: string;
  issue: (issue: number) => string;
  dailyMeta: (issue: number, streak: number) => string;
  dailyTodo: (par: number, min: number, max: number) => string;
  dailyDone: (steps: number, par: number) => string;
  dailyStart: string;
  dailyContinue: string;
  dailyStartLabel: string;
  dailyContinueLabel: string;
  dailyHint: (inventory: number) => string;
  dailyDoneTitle: (stars: number) => string;
  backHome: string;
  dailyPortalNote: string;
  dailySwitchNote: string;

  historyOpen: string;
  historyTitle: string;
  historyEmpty: string;
  historyNote: (coins: number) => string;
  historyPlay: (issue: number) => string;
  historyDoneEntry: (issue: number, steps: number, par: number) => string;
  historyUnplayed: string;
  pastDoneTitle: (stars: number) => string;

  challengeIntro: (steps: number) => string;
  challengeWin: (mine: number, friend: number) => string;
  challengeTie: (steps: number) => string;
  challengeLose: (mine: number, friend: number) => string;

  settingsTitle: string;
  settingsMusic: string;
  settingsStats: string;
  settingOn: string;
  settingOff: string;
  privacy: string;
  installTitle: string;
  installDetail: string;
  installAction: string;
  installIos: string;

  start: string;
  resumeLevel: (level: number) => string;
  levelNumber: (level: number) => string;
  chapterTitle: (chapter: number, name: string) => string;
  chapterGate: (missing: number) => string;
  needStars: (missing: number, chapter: string) => string;
  allPerfect: string;
  allDone: string;
  tileLabel: (level: number, name: string, state: string) => string;
  tileLocked: string;
  tileSkipped: string;
  tileUnplayed: string;
  tileStars: (stars: number) => string;

  itemNames: Record<ItemId, string>;
  itemShort: Record<ItemId, string>;
  itemFree: string;
  itemFreeLabel: (name: string) => string;
  itemCooling: (name: string, seconds: number) => string;
  itemStock: (name: string, stock: number) => string;
  itemPay: (name: string, price: number) => string;
  itemCard: (name: string, stock: number, price: number) => string;
  cooldownEntry: (name: string, seconds: number) => string;
  itemRules: (cooldowns: string) => string;
  shopNote: string;
  rulesTitle: string;
  oddsTitle: string;
  assistWarnTitle: string;
  assistWarnBody: string;
  assistContinue: string;
  leaveTitle: string;
  leaveBody: string;
  leaveAction: string;

  drawTitle: string;
  drawPrice: (price: number) => string;
  drawGot: (prize: string) => string;
  prizeCoins: (amount: number) => string;
  prizeMany: (name: string, count: number) => string;
  oddsEntry: (prize: string, percent: number) => string;

  skinName: string;
  skinDetail: string;
  skinBuy: (price: number) => string;
  skinInUse: string;
  skinUse: string;
  skinInUseLabel: string;

  winTitle: (stars: number) => string;
  reward: (coins: number) => string;
  nextLevel: string;

  defaultHint: string;
  hintTap: string;
  previewArmed: string;
  previewShown: string;
  won: (stars: number) => string;
  litLabel: (lit: number, total: number) => string;
  starsWonLabel: (stars: number) => string;
  starsNowLabel: (stars: number) => string;
  steps: (steps: number) => string;
  assistedNote: string;
  parNote: (par: number) => string;
  placeLeft: (left: number) => string;

  shareTitle: (issue: number) => string;
  shareSteps: (steps: number, par: number) => string;
  shareTries: (attempts: number) => string;
  shareStreak: (streak: number) => string;
  shareVersus: (mine: number, friend: number) => string;
  cardChallenge: string;
  cardSteps: (steps: number, par: number) => string;
  saveImage: string;
  imageSaved: string;
  imageFailed: string;
  inviteTitle: string;
  inviteBody: string;
  inviteAction: string;

  chapterNames: readonly string[];
  levels: Record<string, { name: string; hint?: string }>;
};
