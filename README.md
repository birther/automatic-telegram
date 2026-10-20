# 今天吃什么 · 食物转盘 + 饭钱本

一个装在手机里的小工具，两件事：

1. **转盘**——把犹豫不决想吃的都丢进去，点圆心转起来，再点一下「停」，指针停在哪就吃哪个。
2. **饭钱本**——随手记下每一笔支出和收入，一眼看到**今天 / 本月 / 本年**各花了多少、进了多少。

纯前端实现（HTML + CSS + 原生 JS），不联网、无第三方库、不收集任何数据，打包成 APK 后完全离线可用。

<p>
  <img src="docs/screenshot-wheel.png" width="240" alt="转盘页">
  <img src="docs/screenshot-spinning.png" width="240" alt="转动中">
  <img src="docs/screenshot-result.png" width="240" alt="转出结果">
</p>
<p>
  <img src="docs/screenshot-money.png" width="240" alt="记账页">
</p>

---

## 功能细节

### 🎡 转盘页

- 顶部输入框写想吃的，点「投入」就加进转盘（默认已经放了 8 个常见选项）。
- 点圆心粉色的「转」开始转动，**再点一次绿色的「停」**才慢慢减速停下，指针指到的那一格就是答案。
- **没转动时 GIF 在转盘上方**；**转动时 GIF 出现在转盘下方**。
- 转盘菜单里的食物点一下就移除（带「撤销」）；最多 16 项，重名会提示。
- 名字太长会自动缩小字号，不会糊成一团。

### 🧾 记账页

- 统计卡一次列出 **今日 / 本月 / 本年** 的支出和收入，绿色是收入、粉色是支出。
- 记一笔：选「支出 / 收入」→ 填金额 → 写备注（可选）→ 选日期 → 点「记下这笔」。
- 点统计卡里的任意一行，下面的明细就切换到对应周期；每条都能删，删错可以「撤销」。
- 日期留着今天的日期就是「现在」，改成以前的日期会按那天归到本月 / 本年。

---

## 先在电脑上看效果

直接双击 `www/index.html` 就能用（Chrome / Edge / Safari 都行）。

或者起个本地服务（手机上也能看）：

```bash
npm run serve          # 打开 http://localhost:5173
```

---

## 打包成 APK

### 方式 A：GitHub Actions 自动打包（推荐，本地什么都不用装）

1. 在 GitHub 新建一个仓库（Public / Private 都可以）。
2. 把本文件夹 **里面的内容** 上传到仓库根目录（上传后仓库根目录应该能直接看到 `config.xml`、`www`、`.github`、`package.json`）。
   - 网页上传：仓库首页 → *Add file* → *Upload files* → 把 `www`、`res`、`tools`、`.github`、`config.xml`、`package.json`、`README.md` 一起拖进去。
   - 或者用 git：
     ```bash
     git init
     git add .
     git commit -m "食物转盘 + 饭钱本"
     git branch -M main
     git remote add origin https://github.com/你的用户名/仓库名.git
     git push -u origin main
     ```
3. 打开仓库的 **Actions** 标签页，等 `打包 Android APK` 这个工作流转完（第一次大约 5～10 分钟，主要是下载 Gradle）。
4. 点进这次运行，在页面底部的 **Artifacts** 里下载 `food-wheel-debug-apk.zip`，解压得到 **`app-debug.apk`**。
5. 把 APK 发到手机上安装；第一次装会提示「禁止安装未知来源应用」，去设置里允许这一次即可。

> 也可以在 Actions 页面点 *Run workflow* 手动触发一次。
> 打出来的 `app-debug.apk` 是 **debug 签名**，自己装完全没问题，但不能上架应用商店。

### 方式 B：本地打包（已装好 Node + JDK 17 + Android SDK）

```bash
npm install
npx cordova platform add android@12
npx cordova build android --debug
# 产物：platforms/android/app/build/outputs/apk/debug/app-debug.apk
```

环境要求：Node 16+、JDK 17、Android SDK（Platform 34 + Build-Tools 34）。
也可以先 `npx cordova platform add android`，再用 Android Studio 打开 `platforms/android` 直接跑。

### 方式 C：不用 Cordova

`www/` 目录本身就是一个完整的静态网页。如果你更习惯别的打包方式（Capacitor、Android Studio 建一个 WebView 壳、或任意「网页转 APK」工具），把 `www/` 整个目录当作网页资源，入口页面是 `www/index.html` 即可。

---

## 目录结构

```
food-wheel/
├─ www/                     网页本体（打包进去的就是它）
│  ├─ index.html
│  ├─ css/style.css
│  ├─ js/app.js
│  └─ assets/
│     ├─ idle.gif           转盘没转动时 → 转盘上方
│     ├─ spin.gif           转动时     → 转盘下方
│     └─ money.jpg          记账页头部的小助手
├─ res/icon/                APP 图标（各密度 PNG + 1024 原图）
├─ tools/make_icons.py      用上面的图片重新生成图标
├─ config.xml               Cordova 配置：APP 名、包名、图标、竖屏等
├─ package.json
├─ docs/                    README 用的截图
└─ .github/workflows/android.yml   自动打 APK 的工作流
```

---

## 数据存在哪里

- 转盘菜单和账单都保存在手机本地的 `localStorage` 里（键名 `fw.foods.v2`、`fw.records.v1`）。
- 不联网、不上传、不需要登录。
- 卸载 APP 或在系统设置里「清除数据」会一起清空，重要账目建议自己另外留一份。

---

## 想改点什么

| 想改的东西 | 位置 |
| --- | --- |
| 默认转盘菜单 | `www/js/app.js` 里的 `DEFAULT_FOODS` |
| 快捷添加按钮 | `www/js/app.js` 里的 `PRESETS` |
| 最多几项 | `www/js/app.js` 里的 `MAX_FOODS` |
| 转多快 | `www/js/app.js` 里的 `MAX_VEL`（越大越快） |
| 配色 / 圆角 | `www/css/style.css` 顶部的色值 |
| APP 名称、包名 | `config.xml` 的 `<name>` 和 `<widget id>` |
| APP 图标 | 换掉 `www/assets/money.jpg` 后执行 `python tools/make_icons.py` |

---

## 常见问题

**仓库里看不到 `.github` 文件夹，Actions 也没有工作流？**
网页拖拽上传有时会跳过以点开头的文件夹。有两个办法：
1. 用 `git push` 上传（`.gitignore` 不会挡 `.github`）；
2. 在 GitHub 网页上手动新建文件：路径填 `.github/workflows/android.yml`，把本仓库同名文件的内容整段粘进去，提交后就会自动开始打包。

**Actions 跑失败了？**
先看日志最后一段。多半是 Gradle 下载超时，点 *Re-run jobs* 再跑一次通常就好。若提示缺少 SDK 平台，说明 runner 镜像变了，可把 `npx cordova platform add android@12` 换成更新的版本号。

**手机上装不上？**
「设置 → 应用 → 允许安装未知应用」里给浏览器或文件管理器开权限；部分国产系统还需要关掉「纯净模式」。

**转盘停下后没有提示音？**
目前只有轻微震动（部分机型不支持），没有做音效。

**能不能加导出账单？**
现在没有导出功能，数据在本机 `localStorage` 里。需要的话可以自己加一个「导出 CSV」按钮。

---

## 许可

MIT
