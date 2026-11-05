# 激光反射

转动镜子，把激光引到每一颗水晶上。共 4 章 16 关，另有每日一题，支持中文和英文，手机和电脑都能玩。

## 运行和检查

```bash
npm install
npm run dev
npm test
npm run build
```

## 发布

`npm run build` 生成的 `dist/` 是纯静态网页，资源用相对路径，放到任何静态托管的任意目录都能打开。

- **Cloudflare Pages**：构建命令 `npm run build`，输出目录 `dist`。
- **GitHub Pages**：把 `dist/` 的内容发布到 Pages 分支。

`npm run build:single` 还会生成 `dist/laser-mirror.html`：一个包含全部内容的文件，发给朋友双击就能玩。

## 加关卡

在 `src/levels.ts` 里加一个对象，地图符号见 `src/laser.ts` 的 `parseGrid`。
关卡名和说明写在 `src/locales/` 的每个语言文件里，漏写时 `npm test` 会报出来。
`par` 要等于真正的最少步数，填错时 `npm test` 会报出来。

## 加每日题

`npm run gen:daily` 输出候选地图（JSON），挑好后放进 `src/dailyLevels.ts`。题库按日期循环，`npm test` 会核对每道题的 `par`。

## 加语言

在 `src/locales/` 里照着 `en.ts` 加一个文件，再在 `src/i18n.ts` 的 `LOCALES` 里加一行。漏翻的句子会让类型检查报错。标题字体只支持中文和拉丁字母，其他文字会退回系统字体。
