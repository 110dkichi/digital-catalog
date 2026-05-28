# デジタルカタログ配布システム

展示会用のQRコード対応カタログ配布システムです。

## ファイル構成

```
digital-catalog-nextjs/
├── components/
│   └── DigitalCatalogSystem.jsx   ← メインのアプリ本体
├── pages/
│   ├── _app.js                    ← アプリ全体の設定
│   └── index.js                   ← トップページ
├── styles/
│   └── globals.css                ← 全体のスタイル
├── next.config.js                 ← Next.jsの設定
└── package.json                   ← ライブラリの定義
```

## 管理者パスワード

`components/DigitalCatalogSystem.jsx` の先頭にある以下の行で変更できます：

```js
const ADMIN_PASSWORD = "admin123";  // ← ここを好きな文字列に変更
```
