// 把 dist/ 打成一个 HTML：CSS、JS、字体全部内联，发给别人双击就能玩。
// 用法：node scripts/make-single-file.mjs [输出路径] [--fragment]
// --fragment 去掉 doctype、html、head、body 标签，给会自己加外壳的托管用。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const output = resolve(args.find((arg) => !arg.startsWith('--')) ?? 'dist/laser-mirror.html');
const dist = resolve('dist');

let html = readFileSync(join(dist, 'index.html'), 'utf8');

const inlineCss = (href) => {
  const cssPath = join(dist, href);
  return readFileSync(cssPath, 'utf8').replace(/url\(["']?([^"')]+\.woff2)["']?\)/g, (_, file) => {
    const font = readFileSync(join(dirname(cssPath), file)).toString('base64');
    return `url(data:font/woff2;base64,${font})`;
  });
};

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, href) => `<style>${inlineCss(href)}</style>`);

let moduleScript = '';
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_, src) => {
  moduleScript = readFileSync(join(dist, src), 'utf8').replaceAll('</script', '<\\/script');
  return '';
});
// 放到最后，页面元素都在了才运行
html = html.replace('</body>', () => `<script type="module">${moduleScript}</script>\n</body>`);

// 单文件版没有旁边的文件，安装到桌面和图标都用不了
html = html
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="(apple-touch-icon|icon)"[^>]*>\s*/g, '')
  .replace(/<meta name="apple-mobile-web-app-capable"[^>]*>\s*/, '')
  .replace(/<meta (?:property="og:|name="twitter:)[^>]*>\s*/g, '');

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<\/?(html|head|body)(\s[^>]*)?>\s*/gi, '')
    .replace(/<meta charset[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '<meta name="claude:viewport-fit-sides" content="cover">\n');
  // 名字放最前面，托管方只扫描开头找标题
  const title = /<title>.*?<\/title>/s.exec(html)?.[0] ?? '';
  html = title + '\n' + html.replace(title, '');
}

writeFileSync(output, html);
console.log(`${output} ${(html.length / 1024).toFixed(0)} KB`);
