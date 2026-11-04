# 激光反射

转动镜子，把激光引到每一颗水晶上。共 4 章 16 关，手机和电脑都能玩。

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
`par` 要等于真正的最少步数，填错时 `npm test` 会报出来。
