# Cold Call Roulette / 随机点名轮盘

一个为课堂投影设计的双语随机点名工具。轮盘、问题卡、历史记录和设置全部在浏览器内运行，不需要后端、账号或 API。

A bilingual classroom picker built for the big screen. The wheel, question deck, history, and settings all run locally in the browser with no backend, accounts, or APIs.

## 功能 / Features

- 公平无重复的姓名与问题牌组
- 中文和英文界面切换
- 批量粘贴名单与双语问题
- 浏览器本地持久化，不上传课堂数据
- 全屏演示、声音反馈、键盘快捷键和减少动画模式
- 响应式支持投影、平板与手机

## 本地开发 / Local development

```bash
npm install
npm run dev
```

质量检查：

```bash
npm test
npm run build
```

## 问题格式 / Question format

每行录入一个问题。使用竖线分隔中文与英文：

```text
用一句话概括今天最重要的观点。 | Summarize today's most important idea in one sentence.
```

单语问题会在两种界面中保留原文，不会进行虚假自动翻译。

## 部署 / Deployment

合并或推送到 `main` 后，GitHub Actions 会测试、构建并部署到 GitHub Pages。

Site: <https://mike-zhuang.github.io/Cold-Call-Roulette/>
